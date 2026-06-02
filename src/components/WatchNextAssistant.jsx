"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Brain,
  Film,
  Loader2,
  Send,
  Sparkles,
  Tv,
  X,
  Zap,
} from "lucide-react";

const PROMPT_SUGGESTIONS = [
  "Algo corto, intenso y con buena nota",
  "Una serie ligera para desconectar",
  "Ciencia ficción con buen ritmo",
  "Algo parecido a mis favoritas",
];

function tmdbImg(path, size = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

function mediaLabel(mediaType) {
  return mediaType === "tv" ? "Serie" : "Película";
}

function RecommendationCard({ item, onNavigate }) {
  const poster = tmdbImg(item?.posterPath);
  const backdrop = tmdbImg(item?.backdropPath, "w780");
  const Icon = item?.mediaType === "tv" ? Tv : Film;

  return (
    <Link
      href={item?.href || "#"}
      onClick={onNavigate}
      className="group relative isolate flex min-h-[154px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] p-3 transition duration-300 hover:-translate-y-0.5 hover:border-cyan-300/35 hover:bg-white/[0.075] hover:shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
    >
      {backdrop ? (
        <img
          src={backdrop}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-10 blur-sm transition duration-500 group-hover:opacity-18"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : null}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,9,0.98),rgba(9,9,9,0.82)_56%,rgba(9,9,9,0.94))]" />

      <div className="h-32 w-[86px] shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50 sm:h-36 sm:w-24">
        {poster ? (
          <img
            src={poster}
            alt={item?.title || ""}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-zinc-600">
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 px-1 py-1 sm:px-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="line-clamp-2 text-base font-black text-white sm:text-lg">
              {item?.title}
            </h4>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200/80">
              {mediaLabel(item?.mediaType)}
              {item?.year ? ` · ${item.year}` : ""}
            </p>
          </div>
          {item?.voteAverage ? (
            <span className="shrink-0 rounded-lg bg-yellow-400/10 px-2 py-1 text-xs font-black text-yellow-200">
              {Number(item.voteAverage).toFixed(1)}
            </span>
          ) : null}
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-zinc-300">
          {item?.reason}
        </p>

        {item?.matchTags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.matchTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[10px] font-bold text-zinc-300"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-cyan-200" />
    </Link>
  );
}

export default function WatchNextAssistant({ isMobile = false }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Dime qué te apetece ahora mismo y cruzaré tus pendientes, favoritos, historial y valoraciones para proponerte algo con sentido.",
      recommendations: [],
    },
  ]);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const titleId = "watch-next-assistant-title";
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const latestRecommendations = useMemo(() => {
    const last = [...messages]
      .reverse()
      .find(
        (msg) =>
          Array.isArray(msg.recommendations) && msg.recommendations.length,
      );
    return last?.recommendations || [];
  }, [messages]);

  const latestProvider = useMemo(() => {
    const last = [...messages]
      .reverse()
      .find((msg) => msg.role === "assistant" && msg.provider !== undefined);
    return last?.provider || null;
  }, [messages]);

  const close = () => setOpen(false);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const sendPrompt = async (value = input) => {
    const prompt = String(value || "").trim();
    if (!prompt || loading) return;

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: prompt }]);

    try {
      const res = await fetch("/api/ai/watch-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudo recomendar");

      const note =
        json?.mode === "ranking"
          ? json?.contextSummary?.aiEnabled
            ? " La IA no ha podido completar la selección, así que he usado ranking local con tus datos."
            : " No hay IA configurada ahora mismo, así que he usado ranking local con tus datos."
          : "";

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `${json?.reply || "Estas opciones encajan bien para ahora."}${note}`,
          recommendations: Array.isArray(json?.recommendations)
            ? json.recommendations
            : [],
          contextSummary: json?.contextSummary || null,
          provider: json?.provider || null,
          mode: json?.mode || null,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            error?.message ||
            "No he podido preparar recomendaciones ahora mismo.",
          recommendations: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] overflow-hidden bg-black/80 lg:bg-black/90 p-0 sm:p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.25 }}
          onMouseDown={close}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.94 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 22, scale: 0.985 }
            }
            transition={{
              duration: reduceMotion ? 0.12 : 0.32,
              delay: reduceMotion ? 0 : 0.08,
              ease: [0.22, 1, 0.36, 1],
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="relative mx-auto flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden border border-white/10 bg-[#0a0a0a] lg:rounded-2xl lg:shadow-2xl lg:shadow-black sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)]"
          >
            {/* Header */}
            <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/40 px-4 py-3 sm:px-6 backdrop-blur-sm flex-shrink-0">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="truncate text-sm font-bold text-white sm:text-base"
                  >
                    Qué ver ahora
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Content - Responsive Layout */}
            <div className="min-h-0 flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_340px] gap-0 lg:gap-4 lg:p-4 lg:overflow-hidden">
              {/* Chat Section - Solo visible en mobile */}
              <div className="lg:hidden flex flex-col min-h-0 overflow-hidden">
                <div
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]"
                  aria-live="polite"
                  style={{
                    scrollbarColor: "rgba(255,255,255,0.1) transparent",
                  }}
                >
                  {messages.map((message, index) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        key={`${message.role}-${index}`}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${
                            isUser
                              ? "bg-cyan-500 text-white shadow-[0_12px_30px_rgba(34,211,238,0.18)]"
                              : "bg-white/8 text-zinc-100 border border-white/10"
                          }`}
                        >
                          <p>{message.text}</p>
                          {!isUser &&
                            message.provider &&
                            message.provider !== "ranking" && (
                              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2 py-1 text-[10px] text-cyan-200">
                                <Brain className="h-3 w-3" />
                                {message.provider === "gemini"
                                  ? "Gemini"
                                  : message.provider === "openai"
                                    ? "OpenAI"
                                    : message.provider}
                              </span>
                            )}
                        </div>
                      </div>
                    );
                  })}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-3xl bg-white/8 border border-white/10 px-4 py-2.5 text-sm text-zinc-300">
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                        <span>Pensando...</span>
                      </div>
                    </div>
                  )}

                  {latestRecommendations.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                        Recomendaciones
                      </div>
                      <div className="space-y-3">
                        {latestRecommendations.slice(0, 5).map((item) => {
                          const poster = tmdbImg(item?.posterPath, "w342");
                          const Icon = item?.mediaType === "tv" ? Tv : Film;
                          return (
                            <Link
                              key={`${item.mediaType}-${item.id}`}
                              href={item?.href || "#"}
                              onClick={close}
                              className="group grid grid-cols-[84px_minmax(0,1fr)] gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-3 transition hover:border-cyan-300/30 hover:bg-white/[0.1]"
                            >
                              {poster ? (
                                <img
                                  src={poster}
                                  alt={item?.title}
                                  className="h-20 w-14 rounded-2xl object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-20 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-400">
                                  <Icon className="h-6 w-6" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="line-clamp-2 text-sm font-semibold text-white">
                                  {item?.title}
                                </p>
                                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-cyan-300/70">
                                  {mediaLabel(item?.mediaType)}
                                  {item?.year ? ` · ${item.year}` : ""}
                                </p>
                                <p className="mt-2 text-xs leading-relaxed text-zinc-300 line-clamp-3">
                                  {item?.reason || "Una recomendación para ti."}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Desktop Recommendations Grid - Main content */}
              <div className="hidden lg:flex lg:flex-col min-h-0 lg:border lg:border-white/10 lg:rounded-lg lg:bg-black/30 lg:overflow-hidden">
                <div
                  className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]"
                  style={{
                    scrollbarColor: "rgba(255,255,255,0.1) transparent",
                  }}
                >
                  {latestRecommendations.length > 0 ? (
                    <div className="grid gap-3 auto-rows-max">
                      {latestRecommendations.map((item) => (
                        <RecommendationCard
                          key={`${item.mediaType}-${item.id}`}
                          item={item}
                          onNavigate={close}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                      <Sparkles className="h-8 w-8 text-cyan-300/60 mb-3" />
                      <p className="text-sm font-semibold text-zinc-400">
                        Dime qué te apetece ver
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Desktop Chat Sidebar */}
              <div className="hidden lg:flex lg:flex-col min-h-0 lg:border lg:border-white/10 lg:rounded-lg lg:bg-black/30 lg:overflow-hidden">
                <div
                  className="flex-1 overflow-y-auto px-4 py-4 space-y-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]"
                  aria-live="polite"
                  style={{
                    scrollbarColor: "rgba(255,255,255,0.1) transparent",
                  }}
                >
                  {messages.map((message, index) => {
                    const isUser = message.role === "user";
                    return (
                      <div
                        key={`${message.role}-${index}`}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-full rounded-lg px-3 py-2 text-xs leading-relaxed ${
                            isUser
                              ? "bg-cyan-500/80 text-white"
                              : "bg-white/8 text-zinc-200 border border-white/10"
                          }`}
                        >
                          <p>{message.text}</p>
                        </div>
                      </div>
                    );
                  })}

                  {loading && (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 border border-white/10 px-3 py-2 text-xs text-zinc-300">
                        <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                        <span>Pensando...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Input Area - Fixed at bottom */}
            <div className="border-t border-white/10 bg-black/40 p-3 sm:p-4 backdrop-blur-sm flex-shrink-0">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {PROMPT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendPrompt(suggestion)}
                    disabled={loading}
                    className="shrink-0 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-white disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendPrompt();
                }}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.08] p-2.5 focus-within:border-cyan-400/50 focus-within:bg-white/[0.12]"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="¿Qué te apetece ver?"
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cyan-500 text-white transition hover:bg-cyan-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 120);
        }}
        className={[
          "group relative grid shrink-0 place-items-center rounded-full transition-all duration-200",
          "text-neutral-400",
          "hover:-translate-y-0.5 hover:scale-[1.03] active:scale-95",
          "hover:text-cyan-300 hover:bg-cyan-500/10 hover:ring-cyan-500/30 hover:shadow-[0_0_18px_rgba(34,211,238,0.16)]",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
          isMobile ? "h-10 w-10 p-2" : "h-11 w-11 p-2",
          "ring-1 ring-transparent",
        ].join(" ")}
        aria-label="Abrir recomendador de qué ver"
        title="Qué ver ahora"
      >
        <Sparkles
          className={`transition-transform duration-200 group-hover:scale-110 ${isMobile ? "h-5 w-5" : "h-[22px] w-[22px]"}`}
        />
      </button>

      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
