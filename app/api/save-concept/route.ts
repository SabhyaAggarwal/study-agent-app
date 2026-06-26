import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase";

function toStringArray(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean);
    return items.length > 0 ? items : null;
  }
  if (typeof value === "string") {
    const items = value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length > 0 ? items : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const {
      subject,
      concept,
      masteryLevel,
      overviewGist,
      deepDiveGist,
      strongAreas,
      weakAreas,
      nextSteps,
      notes,
    } = await request.json();

    if (!subject || !concept) {
      return new Response(JSON.stringify({ error: "subject and concept are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient();
    const { data, error } = await supabase.from("concepts").upsert(
      {
        clerk_user_id: userId,
        subject,
        concept,
        mastery_level: masteryLevel ?? null,
        overview_gist: overviewGist ?? null,
        deep_dive_gist: deepDiveGist ?? null,
        strong_areas: toStringArray(strongAreas),
        weak_areas: toStringArray(weakAreas),
        next_steps: toStringArray(nextSteps),
        notes: notes ?? null,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "clerk_user_id,subject,concept" }
    );

    if (error) {
      console.error("Supabase error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in POST handler:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
