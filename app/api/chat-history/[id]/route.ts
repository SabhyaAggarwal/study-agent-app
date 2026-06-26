import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;

  const supabase = createClient();

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, subject, concept, created_at, updated_at")
    .eq("id", id)
    .eq("clerk_user_id", userId)
    .single();

  if (sessionError || !session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return new Response(JSON.stringify({ error: messagesError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ session, messages }), { status: 200 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;

  const supabase = createClient();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", id)
    .eq("clerk_user_id", userId)
    .single();

  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { role, content } = body;

  if (!role || !content) {
    return new Response(JSON.stringify({ error: "role and content are required" }), { status: 400 });
  }

  const { data: message, error } = await supabase
    .from("chat_messages")
    .insert({ session_id: id, role, content })
    .select("id, role, content, created_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return new Response(JSON.stringify(message), { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;

  const supabase = createClient();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", id)
    .eq("clerk_user_id", userId)
    .single();

  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), { status: 404 });
  }

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id)
    .eq("clerk_user_id", userId);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { subject, concept } = body;

  const supabase = createClient();

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (subject !== undefined) updates.subject = subject;
  if (concept !== undefined) updates.concept = concept;

  const { data, error } = await supabase
    .from("chat_sessions")
    .update(updates)
    .eq("id", id)
    .eq("clerk_user_id", userId)
    .select("id, subject, concept, created_at, updated_at")
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify(data), { status: 200 });
}
