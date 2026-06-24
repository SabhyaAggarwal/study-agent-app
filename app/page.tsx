"use client";

import { NavBar } from "@/components/nav-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type SaveMeta = {
  subject: string;
  concept: string;
  masteryLevel?: string;
  strongAreas?: string[];
  weakAreas?: string[];
  nextSteps?: string[];
  notes?: string;
};

function splitWords(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSaveMeta(text: string, subject: string, concept: string): SaveMeta {
  const masteryMatch = text.match(/mastery level[:\-]?\s*([A-Za-z]+)/i);
  const weakMatch = text.match(/weak areas?[:\-]?\s*([^\n]+)/i);
  const strongMatch = text.match(/strong areas?[:\-]?\s*([^\n]+)/i);
  const nextMatch = text.match(/next steps?[:\-]?\s*([^\n]+)/i);

  return {
    subject,
    concept,
    masteryLevel: masteryMatch?.[1]?.trim(),
    weakAreas: splitWords(weakMatch?.[1]),
    strongAreas: splitWords(strongMatch?.[1]),
    nextSteps: splitWords(nextMatch?.[1]),
    notes: text.trim(),
  };
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [concept, setConcept] = useState("");
  const [saveMeta, setSaveMeta] = useState<SaveMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSave = useMemo(
    () => Boolean(subject && concept && saveMeta),
    [subject, concept, saveMeta]
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setError(null);
    setLoading(true);

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      text: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setSaveMeta(null);

    try {
      const detectRes = await fetch("/api/detect-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: trimmed }),
      });
      const detectData = await detectRes.json();
      const detectedSubject = typeof detectData.subject === "string" ? detectData.subject : "";
      const detectedConcept = typeof detectData.concept === "string" ? detectData.concept : "";

      setSubject(detectedSubject);
      setConcept(detectedConcept);

      const assistantId = `${Date.now()}-assistant`;
      setMessages((current) => [...current, { id: assistantId, role: "assistant", text: "" }]);

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: trimmed,
          subject: detectedSubject,
          concept: detectedConcept,
        }),
      });

      if (!chatRes.ok || !chatRes.body) {
        const errBody = await chatRes.text().catch(() => "");
        throw new Error(errBody || "Chat request failed");
      }

      const reader = chatRes.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });

        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, text: assistantText } : message
          )
        );
      }

      if (detectedSubject && detectedConcept) {
        setSaveMeta(parseSaveMeta(assistantText, detectedSubject, detectedConcept));
      }
    } catch (err) {
      console.error(err);
      setError("Unable to send message. Please try again.");
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          text: "Sorry, something went wrong while generating the response.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProgress = async () => {
    if (!canSave || !saveMeta) return;

    try {
      await fetch("/api/save-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveMeta),
      });
      alert("Progress saved.");
    } catch (err) {
      console.error(err);
      alert("Unable to save progress.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-6">
        <NavBar />

        <header className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-slate-800 bg-slate-900/95 px-7 py-6 shadow-2xl shadow-slate-950/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Study agent</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Chat tutor</h1>
          </div>
          <p className="rounded-2xl bg-slate-800 px-4 py-3 text-sm text-slate-300">
            Ask a question, get a streamed explanation.
          </p>
        </header>

        <section className="flex flex-col flex-1 overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/95 shadow-2xl shadow-slate-950/40">
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto px-6 py-6"
          >
            {messages.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/80 px-8 py-12 text-center text-slate-500">
                Start by asking a concept question.
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[80%] rounded-[2rem] bg-slate-800 px-5 py-4 text-slate-100 shadow-lg shadow-slate-950/20"
                        : "max-w-[80%] rounded-[2rem] bg-slate-700/95 px-5 py-4 text-slate-100 shadow-lg shadow-slate-950/20"
                    }
                  >
                    {message.role === "assistant" ? (
                      <div className="break-words text-sm leading-7 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sky-300 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-slate-800 [&_pre]:p-4 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-100 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-medium [&_strong]:font-semibold [&_a]:text-sky-400 [&_a]:underline [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-4 [&_blockquote]:text-slate-400 [&_hr]:my-4 [&_hr]:border-slate-700 [&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-700 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-700 [&_td]:px-3 [&_td]:py-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {message.text || "Thinking..."}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {message.text}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-800 bg-slate-950/95 px-6 py-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-400">
                Detected subject: <span className="text-slate-100">{subject || "—"}</span>
                <span className="mx-2">•</span>
                Detected concept: <span className="text-slate-100">{concept || "—"}</span>
              </div>
              {canSave ? (
                <button
                  type="button"
                  onClick={handleSaveProgress}
                  className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  Save progress
                </button>
              ) : null}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your message..."
                aria-label="Type your study question"
                className="min-h-[56px] flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-5 py-4 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-h-[56px] items-center justify-center rounded-2xl bg-sky-500 px-6 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {loading ? "Sending..." : "Send"}
              </button>
            </form>

            <div className="mt-3 text-xs text-slate-500">
              Press Enter or click Send to submit your question.
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
