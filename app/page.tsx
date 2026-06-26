"use client";

import { NavBar } from "@/components/nav-bar";
import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Session = {
  id: string;
  subject: string | null;
  concept: string | null;
  created_at: string;
  updated_at: string;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function sessionTitle(s: Session): string {
  if (s.subject && s.concept) return `${s.subject} — ${s.concept}`;
  if (s.concept) return s.concept;
  return "Untitled Chat";
}

export default function ChatPage() {
  const { isSignedIn } = useUser();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [concept, setConcept] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detectFailed, setDetectFailed] = useState(false);
  const [manualSubject, setManualSubject] = useState("");
  const [manualConcept, setManualConcept] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [editingField, setEditingField] = useState<"subject" | "concept" | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/chat-history")
      .then((res) => res.json())
      .then(setSessions)
      .catch(() => {});
    fetch("/api/chat-history/cleanup", { method: "POST" }).catch(() => {});
  }, [isSignedIn]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!activeSessionId) return;
    fetch(`/api/chat-history/${activeSessionId}`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages ?? []);
        setSubject(data.session?.subject ?? "");
        setConcept(data.session?.concept ?? "");
        setDetectFailed(false);
      })
      .catch(() => setError("Failed to load messages"));
  }, [activeSessionId]);

  async function createNewSession() {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

    const res = await fetch("/api/chat-history", { method: "POST" });
    if (!res.ok) return;
    const session: Session = await res.json();
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    setSubject("");
    setConcept("");
    setDetectFailed(false);
    setSelectedImage(null);
    setManualSubject("");
    setManualConcept("");

    deleteTimerRef.current = setTimeout(async () => {
      const msgRes = await fetch(`/api/chat-history/${session.id}`);
      if (!msgRes.ok) return;
      const data = await msgRes.json();
      if (data.messages?.length === 0) {
        await fetch(`/api/chat-history/${session.id}`, { method: "DELETE" });
        setSessions((prev) => prev.filter((s) => s.id !== session.id));
        setActiveSessionId((prev) => prev === session.id ? null : prev);
      }
    }, 60000);
  }

  async function saveMessage(role: string, content: string) {
    if (!activeSessionId) return;
    await fetch(`/api/chat-history/${activeSessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    });
  }

  async function updateSessionConcept(subj: string, conc: string) {
    if (!activeSessionId) return;
    const res = await fetch(`/api/chat-history/${activeSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subj, concept: conc }),
    });
    if (res.ok) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, subject: subj, concept: conc } : s))
      );
    }
  }

  async function handleSend() {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

    const trimmed = input.trim();
    if ((!trimmed && !selectedImage) || loading) return;

    const currentImage = selectedImage;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const res = await fetch("/api/chat-history", { method: "POST" });
      if (!res.ok) return;
      const session: Session = await res.json();
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      sessionId = session.id;
    }

    setError(null);
    setLoading(true);
    setDetectFailed(false);

    const displayContent = trimmed && currentImage
      ? `${trimmed}\n\n![Uploaded Image](${currentImage})`
      : currentImage
        ? `![Uploaded Image](${currentImage})`
        : trimmed;

    const userMsg: Message = { id: `${Date.now()}-user`, role: "user", content: displayContent };
    setMessages((prev) => [...prev, userMsg]);

    if (sessionId) {
      saveMessage("user", displayContent);
    }

    setInput("");
    setSelectedImage(null);

    try {
      const detectRes = await fetch("/api/detect-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: trimmed, image: currentImage }),
      });
      const detectData = await detectRes.json();
      const detectedSubject = typeof detectData.subject === "string" ? detectData.subject : "";
      const detectedConcept = typeof detectData.concept === "string" ? detectData.concept : "";

      if (detectedSubject || detectedConcept) {
        if (detectedSubject) setSubject(detectedSubject);
        if (detectedConcept) setConcept(detectedConcept);
        if (sessionId) updateSessionConcept(detectedSubject, detectedConcept);
        if (detectedSubject && detectedConcept) {
          fetch("/api/save-concept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: detectedSubject, concept: detectedConcept }),
          }).catch(() => {});
        }
      } else {
        setDetectFailed(true);
        setSubject("");
        setConcept("");
      }

      const assistantId = `${Date.now()}-assistant`;
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: trimmed,
          subject: detectedSubject || null,
          concept: detectedConcept || null,
          images: currentImage ? [currentImage] : [],
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
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
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m))
        );
      }

      if (sessionId) {
        saveMessage("assistant", assistantText);
      }

      if (detectedSubject && detectedConcept) {
        const masteryMatch = assistantText.match(/mastery level[:\-]?\s*([A-Za-z]+)/i);
        const weakMatch = assistantText.match(/weak areas?[:\-]?\s*([^\n]+)/i);
        const strongMatch = assistantText.match(/strong areas?[:\-]?\s*([^\n]+)/i);
        const nextMatch = assistantText.match(/next steps?[:\-]?\s*([^\n]+)/i);

        fetch("/api/save-concept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: detectedSubject,
            concept: detectedConcept,
            masteryLevel: masteryMatch?.[1]?.trim(),
            weakAreas: weakMatch?.[1] ? weakMatch[1].split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) : [],
            strongAreas: strongMatch?.[1] ? strongMatch[1].split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) : [],
            nextSteps: nextMatch?.[1] ? nextMatch[1].split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) : [],
            notes: assistantText.trim(),
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error(err);
      setError("Unable to send message. Please try again.");
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          content: "Sorry, something went wrong while generating the response.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleRetryDetect() {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    const imgMatch = lastUserMsg.content.match(/!\[.*?\]\(data:([^)]+)\)/);
    const retryImage = imgMatch ? `data:${imgMatch[1]}` : null;
    const textContent = lastUserMsg.content.replace(/!\[.*?\]\(data:[^)]+\)/g, "").trim();

    setDetectFailed(false);
    setLoading(true);

    try {
      const detectRes = await fetch("/api/detect-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: textContent || undefined, image: retryImage }),
      });
      const detectData = await detectRes.json();
      const detectedSubject = typeof detectData.subject === "string" ? detectData.subject : "";
      const detectedConcept = typeof detectData.concept === "string" ? detectData.concept : "";

      if (detectedSubject || detectedConcept) {
        if (detectedSubject) setSubject(detectedSubject);
        if (detectedConcept) setConcept(detectedConcept);
        if (activeSessionId) updateSessionConcept(detectedSubject, detectedConcept);
        if (detectedSubject && detectedConcept) {
          fetch("/api/save-concept", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject: detectedSubject, concept: detectedConcept }),
          }).catch(() => {});
        }
      } else {
        setDetectFailed(true);
      }
    } catch {
      setDetectFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subj = manualSubject.trim();
    const conc = manualConcept.trim();
    if (!subj || !conc) return;
    setSubject(subj);
    setConcept(conc);
    setDetectFailed(false);
    setManualSubject("");
    setManualConcept("");
    if (activeSessionId) updateSessionConcept(subj, conc);
    fetch("/api/save-concept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subj, concept: conc }),
    }).catch(() => {});
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError("Speech recognition is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput((prev) => prev + transcript);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <NavBar />
          <div className="flex items-center justify-center py-24">
            <p className="text-slate-400">Sign in to start chatting with the study agent.</p>
          </div>
        </div>
      </main>
    );
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <main className="h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <div className="mx-auto flex h-full max-w-6xl flex-col px-4 py-4">
        <NavBar />

        <div className="flex flex-1 gap-4 min-h-0">
          <aside className="w-64 shrink-0 flex flex-col rounded-[2rem] border border-slate-800 bg-slate-900/95 shadow-2xl shadow-slate-950/40">
            <div className="p-3 border-b border-slate-800">
              <button
                type="button"
                onClick={createNewSession}
                className="w-full rounded-2xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
              >
                + New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-slate-500">
                  No chats yet. Start a new one.
                </p>
              )}
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSessionId(s.id)}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${
                    activeSessionId === s.id
                      ? "bg-slate-700/80 text-white"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <div className="truncate font-medium">{sessionTitle(s)}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatDate(s.updated_at)}</div>
                </button>
              ))}
            </div>
          </aside>

          <section className="flex flex-1 flex-col rounded-[2rem] border border-slate-800 bg-slate-900/95 shadow-2xl shadow-slate-950/40 overflow-hidden">
            {!activeSessionId ? (
              <div className="flex flex-1 items-center justify-center px-6">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Study agent</p>
                  <h1 className="mt-3 text-3xl font-semibold text-white">Chat tutor</h1>
                  <p className="mt-3 text-sm text-slate-400 max-w-md">
                    Select a chat from the sidebar or start a new one.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-800 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Study agent</p>
                    {(subject || concept) && (
                      <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        {subject ? (
                          editingField === "subject" ? (
                            <input
                              value={subject}
                              onChange={(e) => setSubject(e.target.value)}
                              onBlur={() => {
                                setEditingField(null);
                                if (activeSessionId) updateSessionConcept(subject, concept);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              autoFocus
                              className="w-24 rounded-md border border-sky-500/50 bg-slate-800 px-1.5 py-0.5 text-xs text-sky-300 outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingField("subject")}
                              className="text-sky-300 hover:text-sky-200 hover:underline cursor-pointer"
                            >
                              {subject}
                            </button>
                          )
                        ) : null}
                        {subject && concept && <span> · </span>}
                        {concept ? (
                          editingField === "concept" ? (
                            <input
                              value={concept}
                              onChange={(e) => setConcept(e.target.value)}
                              onBlur={() => {
                                setEditingField(null);
                                if (activeSessionId) updateSessionConcept(subject, concept);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              autoFocus
                              className="w-24 rounded-md border border-emerald-500/50 bg-slate-800 px-1.5 py-0.5 text-xs text-emerald-300 outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingField("concept")}
                              className="text-emerald-300 hover:text-emerald-200 hover:underline cursor-pointer"
                            >
                              {concept}
                            </button>
                          )
                        ) : null}
                      </span>
                    )}
                  </div>
                  <h1 className="mt-1 text-xl font-semibold text-white">
                    {sessionTitle(activeSession ?? { id: "", subject: null, concept: null, created_at: "", updated_at: "" })}
                  </h1>
                </div>

                <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/80 px-8 py-12 text-center text-slate-500">
                      Ask a question to start studying.
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
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ src }) => src ? <img src={src} className="max-h-64 rounded-xl my-2" /> : null }}>
                                {message.content || "Thinking..."}
                              </ReactMarkdown>
                            </div>
                          ) : message.content ? (
                            <div className="break-words text-sm leading-7 [&_p]:mb-2">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ src }) => src ? <img src={src} className="max-h-64 rounded-xl my-2" /> : null }}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                  {loading && messages[messages.length - 1]?.content === "" && (
                    <div className="flex justify-start">
                      <div className="rounded-[2rem] bg-slate-700/95 px-5 py-4 text-sm text-slate-300 shadow-lg shadow-slate-950/20">
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-800 bg-slate-950/95 px-6 py-4">
                  {detectFailed && (
                    <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                      <p className="text-xs font-medium text-amber-300">Concept not detected</p>
                      <p className="mt-1 text-xs text-amber-400/80">
                        Could not identify the subject and concept. Try again or enter them manually.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleRetryDetect}
                          disabled={loading}
                          className="rounded-2xl bg-amber-500/20 px-3.5 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/30 disabled:opacity-50"
                        >
                          Retry detection
                        </button>
                        <form onSubmit={handleManualSubmit} className="flex flex-wrap items-center gap-2">
                          <input
                            value={manualSubject}
                            onChange={(e) => setManualSubject(e.target.value)}
                            placeholder="Subject"
                            className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-500"
                          />
                          <input
                            value={manualConcept}
                            onChange={(e) => setManualConcept(e.target.value)}
                            placeholder="Concept"
                            className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-slate-500"
                          />
                          <button
                            type="submit"
                            className="rounded-2xl bg-emerald-500/20 px-3.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/30"
                          >
                            Set
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSend();
                    }}
                    className="relative flex gap-3"
                  >
                    {selectedImage && (
                      <div className="absolute bottom-full left-0 mb-2 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 p-2">
                        <img
                          src={selectedImage}
                          alt="Preview"
                          className="h-16 w-16 rounded-lg object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setSelectedImage(null)}
                          className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                          setSelectedImage(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex min-h-[48px] w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950 text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={loading}
                      className={`inline-flex min-h-[48px] w-12 shrink-0 items-center justify-center rounded-2xl border text-slate-400 transition hover:border-slate-600 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                        listening
                          ? "border-red-500 bg-red-500/20 text-red-400 shadow-lg shadow-red-500/30"
                          : "border-slate-800 bg-slate-950"
                      }`}
                    >
                      {listening ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 animate-pulse">
                          <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                          <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-8.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                          <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                          <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-8.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                        </svg>
                      )}
                    </button>
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type your message..."
                      aria-label="Type your study question"
                      className="min-h-[48px] flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-5 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-slate-500 focus:ring-2 focus:ring-slate-500/30"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-sky-500 px-6 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                    >
                      {loading ? "Sending..." : "Send"}
                    </button>
                  </form>

                  {error && (
                    <div className="mt-3 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                      {error}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
