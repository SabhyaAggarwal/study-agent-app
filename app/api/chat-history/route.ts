import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, subject, concept, created_at, updated_at")
    .eq("clerk_user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), { status: 200 });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ clerk_user_id: userId, subject: null, concept: null })
    .select("id, subject, concept, created_at, updated_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), { status: 201 });
}
