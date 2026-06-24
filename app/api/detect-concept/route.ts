import { NextRequest } from "next/server";
import { getAIAuthToken } from "@/lib/supabase";

const NVIDIA_API = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODEL = "moonshotai/kimi-k2.6";

export async function POST(request: NextRequest) {
  const authToken = getAIAuthToken();

  if (!authToken) {
    return new Response(JSON.stringify({ subject: "", concept: "" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { userMessage } = body;

  if (!userMessage) {
    return new Response(JSON.stringify({ subject: "", concept: "" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const examples = [
    { msg: "explain photosynthesis", subject: "Biology", concept: "Photosynthesis" },
    { msg: "what is a derivative", subject: "Mathematics", concept: "Derivatives" },
    { msg: "black hole", subject: "Physics", concept: "Black Hole" },
    { msg: "why did Rome fall", subject: "History", concept: "Fall of Rome" },
  ];

  const exampleBlock = examples
    .map((e) => `Message: ${e.msg}\n{"subject": "${e.subject}", "concept": "${e.concept}"}`)
    .join("\n\n");

  const prompt = `From the message, identify the academic subject and the specific concept. Return ONLY a raw JSON object with "subject" and "concept" fields — no markdown, no code fences, no explanation.

Examples:
${exampleBlock}

Message: ${userMessage}`;

  try {
    const response = await fetch(NVIDIA_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 256,
        temperature: 0.01,
        messages: [
          { role: "system", content: "You extract academic subjects and concepts from student questions. Always respond with raw JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("NVIDIA API error:", err);
      return new Response(JSON.stringify({ subject: "", concept: "" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "";

    console.log("=== NVIDIA FULL RESPONSE ===");
    console.log(JSON.stringify(data, null, 2));
    console.log("=============================");

    let subject = "";
    let concept = "";

    const content = raw
      .replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1")
      .replace(/(\r\n|\n|\r)+/g, " ")
      .trim();

    const braceMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = braceMatch ? braceMatch[0] : content;

    try {
      const result = JSON.parse(jsonStr) as { subject?: string; concept?: string };
      subject = (result.subject ?? "").trim();
      concept = (result.concept ?? "").trim();
    } catch {
      console.error("Failed to parse NVIDIA response as JSON, trying regex fallback");
      const subMatch =
        content.match(/"subject"\s*:\s*"([^"]*)"/i) ??
        content.match(/subject[:\s]+"?([A-Za-z][A-Za-z\s]+?)"?[,}]/i);
      const conMatch =
        content.match(/"concept"\s*:\s*"([^"]*)"/i) ??
        content.match(/concept[:\s]+"?([A-Za-z][A-Za-z\s]+?)"?[,}]/i);
      subject = subMatch?.[1]?.trim() ?? "";
      concept = conMatch?.[1]?.trim() ?? "";
    }

    return new Response(JSON.stringify({ subject, concept }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error calling NVIDIA API:", error);
    return new Response(JSON.stringify({ subject: "", concept: "" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
