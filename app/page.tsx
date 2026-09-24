"use client";

export const dynamic = "force-dynamic";

import { FormEvent, useState } from "react";

type Source = {
  id: string;
  title: string;
  url?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  hasKnowledgeBaseAnswer?: boolean;
};

const suggestions = [
  "What is NVIDIA AI Enterprise?",
  "What is NVIDIA NIM?",
  "How is NVIDIA AI Enterprise deployed?",
];

function isDataUnavailable(content?: string): boolean {
  if (!content) return false;
  const s = content
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .trim();

  return (
    s.startsWith("i couldn't find that information in the nvidia knowledge base") ||
    s.startsWith("i could not find that information in the nvidia knowledge base") ||
    s.startsWith("the information was not found in the nvidia knowledge base") ||
    s.startsWith("i couldn't find") ||
    s.startsWith("i could not find") ||
    s.startsWith("i cannot find") ||
    s.startsWith("i can't find") ||
    s.startsWith("i am unable to find") ||
    s.startsWith("i'm unable to find") ||
    s.startsWith("the information was not found") ||
    s.startsWith("the requested information was not found") ||
    s.startsWith("the requested information is not available") ||
    s.startsWith("no information was found") ||
    s.startsWith("there is no information") ||
    s.startsWith("no information is available") ||
    s.startsWith("i don't have information") ||
    s.startsWith("i do not have information") ||
    s.includes("couldn't find that information") ||
    s.includes("could not find that information") ||
    s.includes("cannot find that information") ||
    s.includes("unable to find that information") ||
    s.includes("couldn't find any information") ||
    s.includes("could not find any information") ||
    s.includes("information was not found") ||
    s.includes("information is not found") ||
    s.includes("information is not available") ||
    s.includes("information was not available") ||
    s.includes("data is not available") ||
    s.includes("data was not found") ||
    s.includes("not found in the nvidia knowledge base") ||
    s.includes("not found in the knowledge base") ||
    s.includes("not available in the nvidia knowledge base") ||
    s.includes("not available in the knowledge base") ||
    s.includes("not present in the nvidia knowledge base") ||
    s.includes("not present in the connected nvidia knowledge base") ||
    s.includes("not present in the knowledge base") ||
    s.includes("does not contain information") ||
    s.includes("doesn't contain information") ||
    s.includes("do not have information") ||
    s.includes("don't have information") ||
    s.includes("no mention of") ||
    (s.includes("couldn't find") && s.includes("knowledge base")) ||
    (s.includes("could not find") && s.includes("knowledge base")) ||
    (s.includes("not found") && s.includes("knowledge base")) ||
    (s.includes("not available") && s.includes("knowledge base")) ||
    (s.includes("no information") && s.includes("knowledge base")) ||
    (s.includes("not covered") && s.includes("knowledge base")) ||
    (s.includes("does not contain") && s.includes("knowledge base")) ||
    (s.includes("doesn't contain") && s.includes("knowledge base")) ||
    (s.includes("do not have") && s.includes("knowledge base")) ||
    (s.includes("don't have") && s.includes("knowledge base")) ||
    s.includes("i'm the nvidia enterprise knowledge agent") ||
    s.includes("i am the nvidia enterprise knowledge agent") ||
    (s.includes("only answer questions") && s.includes("nvidia")) ||
    (s.includes("only assist with questions") && s.includes("nvidia")) ||
    s.includes("outside the scope") ||
    s.includes("out of scope")
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(message?: string) {
    const text = (message ?? input).trim();

    if (!text || loading) return;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: text,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Something went wrong."
        );
      }

      const answer = data.answer || "";
      // The server sees the unmodified Foundry response, including its
      // retrieval metadata, so it is the authority on whether sources apply.
      // Keep the text check as a fallback for older or malformed responses.
      const hasKnowledgeBaseAnswer =
        (data.hasKnowledgeBaseAnswer ?? true) && !isDataUnavailable(answer);
      const rawSources: Source[] = Array.isArray(data.sources) ? data.sources : [];
      const validSources = rawSources.filter((s) => {
        if (!s || !s.title) return false;
        const clean = s.title.toLowerCase().trim();
        return (
          clean !== "source" &&
          clean !== "source.pdf" &&
          clean !== "sources" &&
          clean !== "unknown" &&
          !clean.startsWith("file-")
        );
      });
      const sources = hasKnowledgeBaseAnswer ? validSources : [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
          sources,
          hasKnowledgeBaseAnswer,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to contact the NVIDIA agent.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    await sendMessage();
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
        {/* Header */}
        <header className="flex h-20 items-center justify-between border-b border-white/10">
          <div>
            <div className="text-xl font-bold tracking-tight">
              NVIDIA
            </div>

            <div className="text-xs text-white/40">
              Enterprise Knowledge Agent
            </div>
          </div>

          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/60">
            AI-103 Project
          </div>
        </header>

        {/* Main */}
        <section className="flex flex-1 flex-col items-center py-16">
          <div className="w-full max-w-4xl">

            {/* Hero */}
            {messages.length === 0 && (
              <div className="mb-12 text-center">
                <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/50">
                  NVIDIA Enterprise Knowledge
                </div>

                <h1 className="text-5xl font-semibold tracking-tight">
                  Ask NVIDIA anything.
                </h1>

                <p className="mx-auto mt-5 max-w-2xl text-lg text-white/50">
                  Search NVIDIA enterprise documentation using an
                  AI-powered knowledge agent grounded in trusted
                  sources.
                </p>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-6">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[80%] rounded-2xl bg-white px-5 py-4 text-black"
                        : "max-w-[90%] rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5"
                    }
                  >
                    <div
                      className={
                        message.role === "user"
                          ? "mb-2 text-xs font-medium uppercase tracking-wider text-black/50"
                          : "mb-2 text-xs font-medium uppercase tracking-wider text-white/40"
                      }
                    >
                      {message.role === "user"
                        ? "You"
                        : "NVIDIA Agent"}
                    </div>

                    <div
                      className={
                        message.role === "user"
                          ? "whitespace-pre-wrap text-sm leading-7 text-black"
                          : "whitespace-pre-wrap text-sm leading-7 text-white/90"
                      }
                    >
                      {message.content}
                    </div>

                    {/* Sources */}
                    {(() => {
                      if (
                        message.role !== "assistant" ||
                        message.hasKnowledgeBaseAnswer === false ||
                        isDataUnavailable(message.content)
                      ) {
                        return null;
                      }

                      const validSources = (message.sources ?? []).filter(
                        (s) => {
                          if (!s || !s.title) return false;
                          const clean = s.title.toLowerCase().trim();
                          return (
                            clean !== "source" &&
                            clean !== "source.pdf" &&
                            clean !== "sources" &&
                            clean !== "unknown" &&
                            !clean.startsWith("file-")
                          );
                        }
                      );

                      if (validSources.length === 0) {
                        return null;
                      }

                      return (
                        <div className="mt-6 border-t border-white/10 pt-5">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                            Sources
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {validSources.map((source) =>
                              source.url ? (
                                <a
                                  key={source.id}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.06] block"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-3 min-w-0">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
                                        📄
                                      </div>

                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 truncate text-sm font-medium text-white/85 group-hover:text-white">
                                          <span className="truncate">
                                            {source.title}
                                          </span>
                                          <span className="shrink-0 text-xs text-white/40 group-hover:text-white/80">
                                            ↗
                                          </span>
                                        </div>

                                        <div className="mt-1 text-xs text-white/40">
                                          Official NVIDIA documentation
                                        </div>
                                      </div>
                                    </div>

                                    <span className="shrink-0 self-center text-xs font-medium text-white/40 group-hover:text-white/80 transition">
                                      View source →
                                    </span>
                                  </div>
                                </a>
                              ) : (
                                <div
                                  key={source.id}
                                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-sm">
                                      📄
                                    </div>

                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-white/85">
                                        {source.title}
                                      </div>

                                      <div className="mt-1 text-xs text-white/35">
                                        NVIDIA knowledge source
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}

              {/* Loading */}
              {loading && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5">
                  <div className="flex items-center gap-3 text-sm text-white/50">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                    Searching NVIDIA knowledge...
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {messages.length === 0 && (
              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left text-sm text-white/60 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="mt-10"
            >
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 focus-within:border-white/25">
                <input
                  value={input}
                  onChange={(e) =>
                    setInput(e.target.value)
                  }
                  placeholder="Ask about NVIDIA AI Enterprise, NIM, deployment..."
                  className="flex-1 bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-white/30"
                />

                <button
                  type="submit"
                  disabled={
                    loading || !input.trim()
                  }
                  className="rounded-xl bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Ask
                </button>
              </div>
            </form>

            <p className="mt-4 text-center text-xs text-white/25">
              Answers are grounded in the connected NVIDIA
              knowledge base.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
