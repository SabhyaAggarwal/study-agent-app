import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createClient, getAIAuthToken } from "@/lib/supabase";

const NVIDIA_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "nvidia/nvidia-nemotron-nano-9b-v2";

const MASTERY_RUBRIC = `
Mastery level rubric (assess after each response):
- In Progress: No prior knowledge demonstrated.
- Introduced: Can define the concept in their own words or recognize basic facts.
- Developing: Can explain how/why it works, answer "what if" questions, or solve guided problems.
- Proficient: Can apply the concept independently, handle edge cases, or connect it to other ideas.
- Strong: Can teach the concept to others, analyze it critically, or combine it with advanced material.

Only advance the student ONE level per response at most. Be honest — do not inflate.
`;

const ASSESSMENT_INSTRUCTIONS = `
At the end of every response, include exactly these four lines:

Mastery level: [one of: In Progress | Introduced | Developing | Proficient | Strong]
Weak areas: [comma-separated list of specific weaknesses shown in the conversation]
Strong areas: [comma-separated list of specific strengths shown in the conversation]
Next steps: [comma-separated list of specific topics or exercises to try next]

Base your assessment on the FULL conversation history, not just the latest question.`;

function buildSystemPrompt(
  subject: string | null,
  concept: string | null,
  row: {
    mastery_level: string | null;
    weak_areas: string | null;
    strong_areas: string | null;
  } | null
) {
  let modeDescription = "Mode A — beginner friendly, analogy-first, define all terms.";

  if (row) {
    const mastery = row.mastery_level;
    if (mastery === "Introduced" || mastery === "Developing") {
      modeDescription = "Mode B — reference prior knowledge, mention weak areas, moderate pace.";
    } else if (mastery === "Proficient" || mastery === "Strong") {
      modeDescription = "Mode C — technical, skip basics, focus on nuance.";
    }
  }

  const contextLines: string[] = [];
  if (subject) {
    contextLines.push(`Subject: ${subject}`);
  }
  if (concept) {
    contextLines.push(`Concept: ${concept}`);
  }

  if (row) {
    if (row.weak_areas) {
      contextLines.push(`Weak areas: ${row.weak_areas}`);
    }
    if (row.strong_areas) {
      contextLines.push(`Strong areas: ${row.strong_areas}`);
    }
    if (row.mastery_level) {
      contextLines.push(`Mastery level: ${row.mastery_level}`);
    }
  } else {
    contextLines.push(
      "No prior mastery record was found for this subject and concept. Use a beginner-friendly explanation."
    );
  }

  const contextBlock = contextLines.length > 0 ? `${contextLines.join("\n")}\n\n` : "";

  return `You are a helpful learning coach. ${modeDescription}

${contextBlock}When answering, keep the explanation aligned with the student's current level and knowledge. Use clear structure, examples, and analogies when appropriate.
${MASTERY_RUBRIC}
${ASSESSMENT_INSTRUCTIONS}`;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authToken = getAIAuthToken();

  if (!authToken) {
    return NextResponse.json(
      { error: "Missing NVIDIA_API_KEY environment variable" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body !== "object" ||
    typeof body.userMessage !== "string"
  ) {
    return NextResponse.json(
      { error: "Invalid request body. Expected JSON with userMessage string." },
      { status: 400 }
    );
  }

  const history: { role: string; content: string }[] =
    Array.isArray(body.messages) ? body.messages : [];

  const subject = typeof body.subject === "string" && body.subject.trim() !== "" ? body.subject.trim() : null;
  const concept = typeof body.concept === "string" && body.concept.trim() !== "" ? body.concept.trim() : null;

  let row: { mastery_level: string | null; weak_areas: string | null; strong_areas: string | null; } | null = null;

  if (subject && concept) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("concepts")
        .select("mastery_level, weak_areas, strong_areas")
        .eq("clerk_user_id", userId)
        .eq("subject", subject)
        .eq("concept", concept)
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        return NextResponse.json({ error: "Failed to query concept data." }, { status: 500 });
      }

      if (data) {
        row = {
          mastery_level: data.mastery_level ?? null,
          weak_areas: data.weak_areas ?? null,
          strong_areas: data.strong_areas ?? null,
        };
      }
    } catch (error) {
      console.error("Supabase configuration error:", error);
      return NextResponse.json(
        { error: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY." },
        { status: 500 }
      );
    }
  }

  const systemPrompt = buildSystemPrompt(subject, concept, row);

  const apiMessages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of history) {
    if (msg.role === "user" || msg.role === "assistant") {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }

  apiMessages.push({ role: "user", content: `Student asks: ${body.userMessage}` });

  try {
    const nvidiaResponse = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
        messages: apiMessages,
      }),
    });

    if (!nvidiaResponse.ok) {
      const err = await nvidiaResponse.text();
      console.error("NVIDIA API error:", err);
      return NextResponse.json({ error: err || "Failed to get response from AI" }, { status: 500 });
    }

    const reader = nvidiaResponse.body?.getReader();
    if (!reader) {
      console.error("NVIDIA response body is null");
      return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
    }

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    async function* extractText(): AsyncGenerator<Uint8Array> {
      let buffer = "";

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                yield encoder.encode(content);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }
    }

    const generator = extractText();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await generator.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
