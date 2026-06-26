import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient();

  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();

  const { data: staleSessions, error: selectError } = await supabase
    .rpc("delete_empty_sessions", { uid: userId, cutoff: oneMinuteAgo });

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ deleted: (staleSessions as number) ?? 0 }), { status: 200 });
}
