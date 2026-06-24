import { NextResponse } from "next/server";
import { streamText, createTextStreamResponse } from "ai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const anthropicAuthToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables"
  );
}

if (!anthropicAuthToken) {
  throw new Error(
    "Missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN environment variable"
  );
}

const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

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
  }

  const systemPrompt = buildSystemPrompt(subject, concept, row);
  const userPrompt = `Student asks: ${body.userMessage}`;

  const result = await streamText({
    model: "claude-sonnet-4-20250514",
    system: systemPrompt,
    prompt: userPrompt,
    providerOptions: {
      anthropic: {
        authToken: anthropicAuthToken,
      },
    },
    onChunk: () => {},
    onError: () => {},
  });

  return createTextStreamResponse({
    textStream: result.textStream,
    headers: {
      "Cache-Control": "no-cache",
    },
  });
}
