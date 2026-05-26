"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Film,
  Loader2,
  Send,
  Sparkles,
  Tv,
  X,
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
  const titleId = "watch-next-assistant-title";
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  const latestRecommendations = useMemo(() => {
    const last = [...messages]
      .reverse()
      .find((msg) => Array.isArray(msg.recommendations) && msg.recommendations.length);
    return last?.recommendations || [];
  }, [messages]);

  const close = () => setOpen(false);

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
            className="fixed inset-0 z-[9999] overflow-hidden bg-black/90 p-0 sm:p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.25 }}
            onMouseDown={close}
          >
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 bg-black"
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { clipPath: "circle(0% at 50% 50%)" }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : { clipPath: "circle(150% at 50% 50%)" }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { clipPath: "circle(0% at 50% 50%)" }
              }
              transition={{ duration: reduceMotion ? 0.12 : 0.55, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.div
              aria-hidden="true"
              className="absolute inset-0 backdrop-blur-2xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.38, delay: reduceMotion ? 0 : 0.08 }}
            />
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),transparent)]"
              initial={{ y: -160, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -160, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.12 : 0.6, ease: [0.22, 1, 0.36, 1] }}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 32, scale: 0.94, borderRadius: 48 }
              }
              animate={
                reduceMotion
                  ? { opacity: 1 }
                  : { opacity: 1, y: 0, scale: 1, borderRadius: 28 }
              }
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 22, scale: 0.985 }
              }
              transition={{
                duration: reduceMotion ? 0.12 : 0.42,
                delay: reduceMotion ? 0 : 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="relative mx-auto flex h-[100dvh] w-full max-w-[1540px] overflow-hidden border border-white/10 bg-[#080808] shadow-2xl shadow-black sm:h-[calc(100dvh-24px)] sm:w-[calc(100vw-24px)] sm:rounded-[28px]"
            >
              <section className="flex min-w-0 flex-1 flex-col">
                <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-black/35 px-4 py-4 backdrop-blur-xl sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.12)]">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2
                        id={titleId}
                        className="truncate text-base font-black text-white sm:text-lg"
                      >
                        Qué ver ahora
                      </h2>
                      <p className="truncate text-xs text-zinc-500">
                        Recomendaciones cruzando tu actividad, pendientes y favoritos
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    aria-label="Cerrar recomendador"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>

                <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(360px,0.78fr)_minmax(520px,1.22fr)]">
                  <div className="flex min-h-0 flex-col border-white/10 lg:border-r">
                    <div
                      className="flex-1 overflow-y-auto px-4 py-5 sm:px-6"
                      aria-live="polite"
                    >
                      <div className="space-y-4">
                        {messages.map((message, index) => {
                          const isUser = message.role === "user";
                          return (
                            <div
                              key={`${message.role}-${index}`}
                              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={[
                                  "max-w-[92%] rounded-3xl px-4 py-3 text-sm leading-relaxed",
                                  isUser
                                    ? "bg-cyan-300 text-black shadow-[0_14px_36px_rgba(34,211,238,0.16)]"
                                    : "border border-white/10 bg-white/[0.045] text-zinc-200",
                                ].join(" ")}
                              >
                                {message.text}
                              </div>
                            </div>
                          );
                        })}

                        {loading ? (
                          <div className="flex justify-start">
                            <div className="inline-flex items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-zinc-300">
                              <Loader2 className="h-4 w-4 animate-spin text-cyan-200" />
                              Pensando opciones con tus datos...
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <footer className="border-t border-white/10 bg-black/30 p-4 backdrop-blur-xl sm:p-5">
                      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {PROMPT_SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => sendPrompt(suggestion)}
                            disabled={loading}
                            className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-cyan-300/30 hover:text-white disabled:opacity-50"
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
                        className="flex items-center gap-2 rounded-3xl border border-cyan-300/25 bg-white/[0.055] p-2 shadow-[0_0_28px_rgba(34,211,238,0.07)] focus-within:border-cyan-300/50"
                      >
                        <input
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          placeholder="Me apetece algo..."
                          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-zinc-500"
                        />
                        <button
                          type="submit"
                          disabled={loading || !input.trim()}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-300 text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
                          aria-label="Enviar preferencia"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </button>
                      </form>
                    </footer>
                  </div>

                  <aside className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 lg:px-7">
                    <div className="mb-5 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200/75">
                          Selección
                        </p>
                        <h3 className="mt-2 text-2xl font-black text-white sm:text-3xl">
                          Próximas opciones
                        </h3>
                      </div>
                      {latestRecommendations.length ? (
                        <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-bold text-zinc-400">
                          {latestRecommendations.length} títulos
                        </span>
                      ) : null}
                    </div>

                    {latestRecommendations.length > 0 ? (
                      <div className="grid gap-4 xl:grid-cols-2">
                        {latestRecommendations.map((item) => (
                          <RecommendationCard
                            key={`${item.mediaType}-${item.id}`}
                            item={item}
                            onNavigate={close}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid min-h-[360px] place-items-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] p-8 text-center">
                        <div className="max-w-md">
                          <Sparkles className="mx-auto h-10 w-10 text-cyan-200/80" />
                          <h3 className="mt-4 text-xl font-black text-white">
                            Dime qué te apetece ver
                          </h3>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                            El asistente buscará opciones con tus pendientes,
                            favoritos, historial y valoraciones.
                          </p>
                        </div>
                      </div>
                    )}
                  </aside>
                </div>
              </section>
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
          "relative grid shrink-0 place-items-center rounded-full border border-white/10 bg-[#1A1A1A] text-cyan-100 shadow-lg transition duration-300",
          "hover:border-white/20 hover:bg-[#202020] hover:text-white hover:shadow-[0_0_24px_rgba(34,211,238,0.18)] active:scale-95",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/10",
          isMobile ? "h-10 w-10" : "h-11 w-11",
        ].join(" ")}
        aria-label="Abrir recomendador de qué ver"
        title="Qué ver ahora"
      >
        <Sparkles className={isMobile ? "h-5 w-5" : "h-5 w-5"} />
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(196,181,253,0.95)]" />
      </button>

      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
