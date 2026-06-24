import { NextResponse } from "next/server";
import { createClient, getAnthropicAuthToken } from "@/lib/supabase";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

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

  return `You are a helpful learning coach. ${modeDescription}\n\n${contextBlock}When answering, keep the explanation aligned with the student's current level and knowledge. Use clear structure, examples, and analogies when appropriate. Only produce the direct answer content; do not include system-level commentary.`;
}

export async function POST(request: Request) {
  const authToken = getAnthropicAuthToken();

  if (!authToken) {
    return NextResponse.json(
      { error: "Missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable" },
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

  const subject = typeof body.subject === "string" && body.subject.trim() !== "" ? body.subject.trim() : null;
  const concept = typeof body.concept === "string" && body.concept.trim() !== "" ? body.concept.trim() : null;

  let row: { mastery_level: string | null; weak_areas: string | null; strong_areas: string | null; } | null = null;

  if (subject && concept) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("concepts")
        .select("mastery_level, weak_areas, strong_areas")
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
  const userPrompt = `Student asks: ${body.userMessage}`;

  const anthropicResponse = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": authToken,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      stream: true,
    }),
  });

  if (!anthropicResponse.ok) {
    const err = await anthropicResponse.text();
    console.error("Anthropic API error:", err);
    return NextResponse.json({ error: "Failed to get response from AI" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (
                  parsed.type === "content_block_delta" &&
                  parsed.delta?.type === "text_delta"
                ) {
                  controller.enqueue(encoder.encode(parsed.delta.text));
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        }
      } catch (error) {
        console.error("Stream error:", error);
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
