import { generateText } from "ai";
import { NextRequest } from "next/server";

const anthropicAuthToken = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { userMessage } = body;

  if (!userMessage) {
    return new Response(JSON.stringify({ subject: "", concept: "" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!anthropicAuthToken) {
    return new Response(JSON.stringify({ error: "Missing Anthropic API key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const prompt = `Extract the subject and concept from the following message. Only return a JSON object with "subject" and "concept" fields. Message: ${userMessage}`;

  try {
    const { text } = await generateText({
      model: "claude-haiku-4-5-20251001",
      prompt,
      providerOptions: {
        anthropic: {
          authToken: anthropicAuthToken,
        },
      },
    });

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
