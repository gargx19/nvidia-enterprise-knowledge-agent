"use client";

import { FormEvent, useState } from "react";

type Source = {
  id: string;
  title: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const suggestions = [
  "What is NVIDIA AI Enterprise?",
  "What is NVIDIA NIM?",
  "How is NVIDIA AI Enterprise deployed?",
];

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

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources ?? [],
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

                    <div className="whitespace-pre-wrap text-sm leading-7 text-white/90">
                      {message.content}
                    </div>

                    {/* Sources */}
                    {message.role === "assistant" &&
                      message.sources &&
                      message.sources.length > 0 && (
                        <div className="mt-6 border-t border-white/10 pt-5">
                          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                            Sources
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            {message.sources.map((source) => (
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
                            ))}
                          </div>
                        </div>
                      )}
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