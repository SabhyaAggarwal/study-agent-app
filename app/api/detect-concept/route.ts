import { NextRequest } from "next/server";
import { getAnthropicAuthToken } from "@/lib/supabase";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export async function POST(request: NextRequest) {
  const authToken = getAnthropicAuthToken();

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

  const prompt = `Extract the subject and concept from the following message. Only return a JSON object with "subject" and "concept" fields. Message: ${userMessage}`;

  try {
    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": authToken,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return new Response(JSON.stringify({ subject: "", concept: "" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    let subject = "";
    let concept = "";

    try {
      const result = JSON.parse(text) as { subject?: string; concept?: string };
      subject = result.subject ?? "";
      concept = result.concept ?? "";
    } catch {
      // If parsing fails, keep as empty
    }

    return new Response(JSON.stringify({ subject, concept }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error calling Anthropic API:", error);
    return new Response(JSON.stringify({ subject: "", concept: "" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
