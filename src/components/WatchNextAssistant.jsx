"use client";

// «Qué ver con IA» a pantalla completa (/assistant).
//
// Antes era un panel modal que el navbar mantenía montado (escritorio: desde el
// desplegable de Perfil; móvil: una fila del menú lateral). Ahora es una página
// de chat: los dos accesos del navbar son enlaces a /assistant.
//
//  - Conversación: burbujas del usuario a la derecha y del asistente a la
//    izquierda, indicador de «escribiendo» mientras responde y las
//    recomendaciones como tarjetas de título de la app (PosterTile: abren la
//    ficha rápida, igual que en Favoritos o Pendientes).
//  - Caja de texto fija abajo: Enter envía, Shift+Enter hace salto de línea.
//  - Conversaciones guardadas en el dispositivo (lib/assistant/conversations):
//    barra propia a la izquierda en escritorio; en el móvil, hoja inferior
//    desde la cabecera. «Conversación nueva» empieza otra.
//  - Encaja entre las barras de la app: la barra superior, la lateral de
//    escritorio (DesktopSideNavInset la aparta sola) y la inferior del móvil.
//    Con el teclado del móvil abierto, la página mide lo que queda visible
//    sobre él, así que la caja de texto queda justo encima.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Brain,
  Dices,
  History,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import LiquidButton from "@/components/LiquidButton";
import PosterTile from "@/components/social/PosterTile";
import AssistantRoulette from "@/components/assistant/AssistantRoulette";
import MobileOptionsSheet from "@/components/ui/MobileOptionsSheet";
import useFitViewportPage from "@/hooks/useFitViewportPage";
import { LIQUID_GLASS_BAR, LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";
import {
  WELCOME_TEXT,
  conversationTitle,
  hasUserMessages,
  newConversationId,
  readConversations,
  readRecentRecommendationKeys,
  saveRecentRecommendations,
  upsertConversation,
  writeConversations,
} from "@/lib/assistant/conversations";

const PROMPT_SUGGESTIONS = [
  "Algo corto, intenso y con buena nota",
  "Una serie ligera para desconectar",
  "Ciencia ficción con buen ritmo",
  "Algo parecido a mis favoritas",
];

const QUICK_PICK_PROMPT = "Recomiéndame 3 cosas para ver ahora";
const COMPOSER_MAX_HEIGHT = 160;

function providerLabel(provider) {
  if (provider === "gemini") return "Gemini";
  if (provider === "openai") return "OpenAI";
  if (provider === "ollama") return "Ollama";
  return provider;
}

function relativeDay(ts) {
  const date = new Date(Number(ts));
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()) -
      new Date(date.getFullYear(), date.getMonth(), date.getDate())) /
      86400000,
  );
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------

function TitleCard({ item }) {
  const meta = [item?.mediaType === "tv" ? "Serie" : "Película", item?.year]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="w-[8.5rem] shrink-0 snap-start sm:w-36 desktop:w-auto">
      <PosterTile item={item} />
      <p className="mt-2 line-clamp-1 text-sm font-bold text-white" title={item?.title}>
        {item?.title}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-cyan-200/80">
        <span className="truncate">{meta}</span>
        {item?.voteAverage ? (
          <span className="shrink-0 text-yellow-200/90">★ {Number(item.voteAverage).toFixed(1)}</span>
        ) : null}
      </p>
      {item?.reason ? (
        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-400">{item.reason}</p>
      ) : null}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div
      aria-hidden="true"
      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-400/15 text-cyan-200"
    >
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function Message({ message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-br-lg bg-cyan-500 px-4 py-2.5 text-sm leading-relaxed text-white shadow-[0_12px_30px_rgba(34,211,238,0.18)]">
          {message.text}
        </div>
      </div>
    );
  }

  const recs = Array.isArray(message.recommendations) ? message.recommendations : [];
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1">
        <div
          className={`inline-block max-w-full whitespace-pre-wrap break-words rounded-3xl rounded-tl-lg px-4 py-2.5 text-sm leading-relaxed ${
            message.error ? "bg-red-500/10 text-red-100" : "bg-white/[0.06] text-zinc-100"
          }`}
        >
          {message.text}
        </div>
        {message.provider && message.provider !== "ranking" ? (
          <span className="ml-1 mt-1.5 flex w-fit items-center gap-1.5 text-[10px] text-cyan-200/70">
            <Brain className="h-3 w-3" />
            {providerLabel(message.provider)}
          </span>
        ) : null}
        {recs.length ? (
          <div className="-mx-4 mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden desktop:mx-0 desktop:grid desktop:grid-cols-[repeat(auto-fill,minmax(8.75rem,1fr))] desktop:gap-4 desktop:overflow-visible desktop:px-0">
            {recs.map((item) => (
              <TitleCard key={`${item.mediaType}-${item.id}`} item={item} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3" role="status" aria-label="El asistente está escribiendo">
      <AssistantAvatar />
      <div className="flex items-center gap-1 rounded-3xl rounded-tl-lg bg-white/[0.06] px-4 py-3.5">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-300 motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationList({ conversations, activeId, onSelect, onDelete }) {
  if (!conversations.length) {
    return (
      <p className="px-3 py-2 text-xs leading-relaxed text-zinc-500">
        Tus conversaciones aparecerán aquí. Se guardan en este dispositivo.
      </p>
    );
  }
  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => {
        const active = c.id === activeId;
        return (
          <li key={c.id} className="group/conv relative">
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              aria-current={active ? "true" : undefined}
              className={`flex w-full flex-col rounded-xl px-3 py-2 pr-9 text-left transition-colors ${
                active ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="truncate text-sm">{c.title}</span>
              <span className="text-[11px] text-zinc-500">{relativeDay(c.updatedAt)}</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              aria-label={`Borrar «${c.title}»`}
              className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/10 hover:text-red-300 desktop:opacity-0 desktop:group-hover/conv:opacity-100 desktop:focus-visible:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export default function WatchNextAssistant() {
  useFitViewportPage();

  const [conversationId, setConversationId] = useState(newConversationId);
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [roulette, setRoulette] = useState(null); // null | items[]
  const [rouletteLoading, setRouletteLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(null);

  const rootRef = useRef(null);
  const scrollerRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const instantScrollRef = useRef(true);

  useEffect(() => {
    setConversations(readConversations());
  }, []);

  // Guardar la conversación en curso en cuanto el usuario ha escrito algo.
  useEffect(() => {
    if (!hasUserMessages(messages)) return;
    const updatedAt = Number(messages.at(-1)?.at) || Date.now();
    setConversations((prev) => {
      const next = upsertConversation(prev, { id: conversationId, updatedAt, messages });
      writeConversations(next);
      return next;
    });
  }, [conversationId, messages]);

  // Bajar al último mensaje. Al cambiar de conversación, sin animación.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const instant = instantScrollRef.current;
    instantScrollRef.current = false;
    // Una respuesta nueva con tarjetas puede medir más que la pantalla: se
    // queda al principio de la respuesta, no al final de las tarjetas.
    const last = el.querySelector("[data-message]:last-of-type");
    if (!instant && !loading && last?.dataset.message === "assistant") {
      const top = last.offsetTop - 16;
      el.scrollTo({ top: Math.min(top, el.scrollHeight), behavior: "smooth" });
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? "auto" : "smooth" });
  }, [messages, loading, conversationId]);

  // TECLADO DEL MÓVIL. Chrome y Safari no encogen la página al abrirlo (solo
  // el viewport visual), así que la caja de texto quedaría tapada. Mientras
  // está abierto, la página mide exactamente lo visible bajo su borde
  // superior; cerrado, manda el alto en CSS (que descuenta la barra inferior).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;
        const keyboardOpen = window.innerHeight - vv.height > 120;
        if (!keyboardOpen) {
          setKeyboardHeight(null);
          return;
        }
        const top = root.getBoundingClientRect().top;
        setKeyboardHeight(Math.max(240, Math.round(vv.offsetTop + vv.height - top)));
      });
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // La caja crece con el texto hasta COMPOSER_MAX_HEIGHT y luego desplaza.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [input]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const latestRecommendations = useMemo(() => {
    const last = [...messages]
      .reverse()
      .find((m) => Array.isArray(m.recommendations) && m.recommendations.length);
    return last?.recommendations || [];
  }, [messages]);

  const focusInput = () => {
    // En táctil no se abre el teclado por sorpresa.
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  };

  const resetPending = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setRoulette(null);
  };

  const startNewConversation = () => {
    resetPending();
    instantScrollRef.current = true;
    setConversationId(newConversationId());
    setMessages([]);
    setInput("");
    setHistoryOpen(false);
    focusInput();
  };

  const openConversation = (id) => {
    const found = conversations.find((c) => c.id === id);
    if (!found) return;
    resetPending();
    instantScrollRef.current = true;
    setConversationId(found.id);
    setMessages(found.messages);
    setHistoryOpen(false);
  };

  const deleteConversation = (id) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      writeConversations(next);
      return next;
    });
    if (id === conversationId) startNewConversation();
  };

  const requestRecommendations = useCallback(async ({ message, mode, limit, signal }) => {
    const res = await fetch("/api/ai/watch-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        mode,
        limit,
        recentKeys: readRecentRecommendationKeys(),
      }),
      signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "No se pudo recomendar");
    return json;
  }, []);

  const sendPrompt = async (value = input, { mode = "chat" } = {}) => {
    const isQuickPick = mode === "quick_pick";
    const prompt = String(value || "").trim();
    const displayPrompt = prompt || (isQuickPick ? QUICK_PICK_PROMPT : "");
    if (!displayPrompt || loading) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setRoulette(null);
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", text: displayPrompt, at: Date.now() }]);

    try {
      const json = await requestRecommendations({
        message: prompt,
        mode: isQuickPick ? "quick_pick" : "chat",
        limit: isQuickPick ? 3 : 5,
        signal: controller.signal,
      });
      const recommendations = Array.isArray(json?.recommendations) ? json.recommendations : [];
      saveRecentRecommendations(recommendations);
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
          recommendations,
          provider: json?.provider || null,
          mode: json?.mode || null,
          at: Date.now(),
        },
      ]);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: error?.message || "No he podido preparar recomendaciones ahora mismo.",
          recommendations: [],
          error: true,
          at: Date.now(),
        },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  };

  const openRoulette = async () => {
    if (latestRecommendations.length >= 3) {
      setRoulette(latestRecommendations.slice(0, 8));
      setHistoryOpen(false);
      return;
    }
    if (rouletteLoading || loading) return;
    setRouletteLoading(true);
    try {
      const json = await requestRecommendations({ message: "", mode: "quick_pick", limit: 8 });
      const recs = Array.isArray(json?.recommendations) ? json.recommendations : [];
      if (recs.length < 3) throw new Error("No hay recomendaciones suficientes para la ruleta.");
      setMessages((prev) => [
        ...prev,
        { role: "user", text: "Probar la ruleta", at: Date.now() },
        {
          role: "assistant",
          text: "He preparado estas recomendaciones para girar la ruleta.",
          recommendations: recs,
          provider: json?.provider || null,
          mode: json?.mode || null,
          at: Date.now(),
        },
      ]);
      setRoulette(recs.slice(0, 8));
      setHistoryOpen(false);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: error?.message || "No se pudo iniciar la ruleta.",
          error: true,
          at: Date.now(),
        },
      ]);
    } finally {
      setRouletteLoading(false);
    }
  };

  const onComposerKeyDown = (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendPrompt();
  };

  const empty = messages.length === 0;
  const activeTitle = empty ? "Qué ver con IA" : conversationTitle(messages);

  const quickActions = (
    <>
      <button
        type="button"
        onClick={() => sendPrompt("", { mode: "quick_pick" })}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-3.5 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Zap className="h-3.5 w-3.5" />
        Recomiéndame 3
      </button>
      <button
        type="button"
        onClick={openRoulette}
        disabled={loading || rouletteLoading}
        className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-3.5 py-2 text-xs font-bold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {rouletteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Dices className="h-3.5 w-3.5" />}
        {rouletteLoading ? "Cargando…" : "Probar la ruleta"}
      </button>
    </>
  );

  return (
    <div
      ref={rootRef}
      data-assistant-page=""
      // La página ocupa el hueco que dejan las barras de la app (la superior,
      // la lateral de escritorio vía DesktopSideNavInset y la inferior del
      // móvil). El fondo de color no depende de eso: es `fixed inset-0` y pasa
      // por debajo de las barras igualmente.
      className="relative isolate flex h-[calc(100svh-9rem-var(--sv-safe-top,0px)-var(--sv-safe-bottom,0px))] w-full overflow-hidden desktop:h-[calc(100svh-4rem-var(--sv-safe-top,0px))]"
      style={keyboardHeight ? { height: `${keyboardHeight}px` } : undefined}
    >
      {/* FONDO DE PÁGINA: capa `fixed inset-0`, como en Favoritos, Pendientes
          o Historial, así que llega bajo la barra superior y la lateral.
          DEGRADADOS RADIALES y no manchas con `blur`: las manchas tenían un
          ancho máximo (800px) y en una pantalla ancha solo cubrían las
          esquinas, el centro quedaba negro y la violeta se cortaba en una
          franja bajo la barra superior. Los degradados se miden en % de la
          ventana, así que el reparto es el mismo en cualquier ancho, y se
          apagan solos sin borde (y sin el coste del filtro).
          UN SOLO COLOR: el azul de los acentos de la página (sky-400, el de
          las burbujas y los iconos), más presente en los extremos izquierdo y
          derecho y en el centro, y más suave arriba y abajo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            // Extremos, de arriba abajo.
            "radial-gradient(32% 85% at 0% 50%, rgba(56,189,248,0.22), transparent 75%)",
            "radial-gradient(32% 85% at 100% 50%, rgba(56,189,248,0.22), transparent 75%)",
            // Luz central; la de arriba tiñe la barra superior y la de abajo
            // acompaña a la caja de texto.
            "radial-gradient(60% 60% at 50% 45%, rgba(56,189,248,0.22), transparent 72%)",
            "radial-gradient(55% 35% at 50% 0%, rgba(56,189,248,0.16), transparent 75%)",
            "radial-gradient(60% 40% at 50% 105%, rgba(56,189,248,0.20), transparent 72%)",
          ].join(","),
        }}
      />

      {/* Barra de conversaciones (escritorio): PANEL INDEPENDIENTE que flota
          en la zona izquierda, separado de la barra lateral de la app (4rem)
          y de la superior, con las cuatro esquinas redondeadas.
          Antes iba pegado a la esquina de la pantalla y por debajo de las dos
          barras: así las tapaba y no se veía el fondo de color detrás de ellas.
          El cristal es el de la barra lateral (LIQUID_GLASS_BAR), así que se
          lee como pieza de la misma familia y deja pasar el color del fondo.
          ALTO SEGÚN LA PANTALLA, CENTRADO: el 90% del hueco de la página, con
          un tope de 50rem (78% y 42rem quedaba demasiado corto y aislado en el
          centro), en vez de estirarse de arriba abajo. 4rem a la izquierda
          (`ml-16`): con 1.5rem y 2.5rem iba demasiado pegado a la barra lateral. Va centrado
          con `self-center` y sube 2rem (`-top-8`, la mitad de la barra
          superior): así su centro coincide con el de la ventana, que es donde
          está la barra lateral de la app. `max-h` le guarda al menos 1.5rem
          arriba tras ese desplazamiento; si no cabe todo, desplaza la lista. */}
      <aside
        aria-label="Conversaciones"
        className={`relative -top-8 isolate z-10 ml-16 hidden h-[min(50rem,90%)] max-h-[calc(100%-7rem)] w-72 shrink-0 flex-col self-center overflow-hidden rounded-[2rem] ${LIQUID_GLASS_BAR} transform-gpu desktop:flex`}
      >
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-100">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-white">Qué ver con IA</h1>
            <p className="truncate text-xs text-zinc-400">Con tus listas, historial y notas</p>
          </div>
        </div>
        <div className="px-4">
          <button
            type="button"
            onClick={startNewConversation}
            className="flex w-full items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3.5 py-2.5 text-sm font-bold text-white transition hover:bg-white/[0.12]"
          >
            <MessageSquarePlus className="h-4 w-4 text-cyan-300" />
            Conversación nueva
          </button>
          {/* En filas a todo el ancho: en dos columnas no cabían y partían
              el texto en dos líneas. */}
          <div className="mt-2 grid gap-1.5">{quickActions}</div>
        </div>
        <div className="mx-4 mb-1.5 mt-7 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          Recientes
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]">
          <ConversationList
            conversations={conversations}
            activeId={conversationId}
            onSelect={openConversation}
            onDelete={deleteConversation}
          />
        </div>
      </aside>

      {/* Conversación */}
      <section className="relative z-10 flex min-w-0 flex-1 flex-col">
        {/* Cabecera móvil: título y acciones */}
        <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-1 desktop:hidden">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-100">
            <Bot className="h-[18px] w-[18px]" />
          </div>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold text-white">{activeTitle}</h1>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            aria-label="Conversaciones guardadas"
            className={`grid h-10 w-10 place-items-center rounded-full text-white ${LIQUID_GLASS_PANEL}`}
          >
            <History className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            onClick={startNewConversation}
            aria-label="Conversación nueva"
            className={`grid h-10 w-10 place-items-center rounded-full text-white ${LIQUID_GLASS_PANEL}`}
          >
            <MessageSquarePlus className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div
          ref={scrollerRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]"
        >
          {roulette ? (
            <AssistantRoulette items={roulette} onBack={() => setRoulette(null)} />
          ) : empty ? (
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center px-4 py-8">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-cyan-300/10 text-cyan-100">
                <Sparkles className="h-7 w-7" />
              </div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">¿Qué te apetece ver?</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-zinc-400">{WELCOME_TEXT}</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {PROMPT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => sendPrompt(suggestion)}
                    disabled={loading}
                    className="rounded-2xl bg-white/[0.06] px-4 py-3 text-left text-sm text-zinc-200 transition hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 desktop:hidden">{quickActions}</div>
            </div>
          ) : (
            <div
              className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-6 pt-2 desktop:pt-8"
              aria-live="polite"
            >
              {messages.map((message, index) => (
                <div key={`${message.at || 0}-${index}`} data-message={message.role}>
                  <Message message={message} />
                </div>
              ))}
              {loading ? <TypingIndicator /> : null}
            </div>
          )}
        </div>

        {/* Caja de texto, fija abajo */}
        <div className="shrink-0 px-3 pb-3 pt-1 desktop:px-6 desktop:pb-5">
          <div
            className={`relative isolate mx-auto flex w-full max-w-3xl items-end gap-2 rounded-[1.75rem] py-1.5 pl-4 pr-1.5 ${LIQUID_GLASS_PANEL} transform-gpu`}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
              onFocus={() => {
                const el = scrollerRef.current;
                if (el) window.setTimeout(() => el.scrollTo({ top: el.scrollHeight }), 250);
              }}
              placeholder="¿Qué te apetece ver?"
              aria-label="Mensaje para el asistente"
              enterKeyHint="send"
              className="max-h-40 min-w-0 flex-1 resize-none self-center bg-transparent py-2.5 text-[15px] leading-6 text-white outline-none placeholder:text-zinc-500"
            />
            <LiquidButton
              type="button"
              liquidGlass
              groupId="assistant-composer"
              activeColor="teal"
              active={Boolean(input.trim())}
              disabled={loading || !input.trim()}
              loading={loading}
              title="Enviar"
              onClick={() => sendPrompt()}
              className="!h-11 !w-11 shrink-0"
            >
              <ArrowUp className="h-5 w-5" />
            </LiquidButton>
          </div>
          <p className="mx-auto mt-1.5 hidden max-w-3xl text-center text-[11px] text-zinc-500 desktop:block">
            Enter para enviar · Shift + Enter para un salto de línea
          </p>
        </div>
      </section>

      <MobileOptionsSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Conversaciones"
        icon={History}
        accent="zinc"
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={startNewConversation}
            className="flex w-full items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3.5 py-3 text-sm font-bold text-white"
          >
            <MessageSquarePlus className="h-4 w-4 text-cyan-300" />
            Conversación nueva
          </button>
          <ConversationList
            conversations={conversations}
            activeId={conversationId}
            onSelect={openConversation}
            onDelete={deleteConversation}
          />
        </div>
      </MobileOptionsSheet>
    </div>
  );
}
