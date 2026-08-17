"use client";

// src/components/community/CommentLikeButton.jsx
// Me gusta en una reseña.
//
// El contador se mueve al pulsar y se revierte si la petición falla: valorar una
// reseña debe sentirse instantáneo, y el servidor es idempotente, así que un
// doble clic no puede desincronizar nada. Sin sesión el botón no desaparece —
// sigue mostrando el recuento— pero no invita a pulsar.

import { useState } from "react";
import { ThumbsUp } from "lucide-react";

export default function CommentLikeButton({
  commentId,
  mediaType,
  tmdbId,
  likes = 0,
  liked = false,
  canLike = false,
  className = "",
}) {
  const [state, setState] = useState({ liked: Boolean(liked), likes: Number(likes) || 0 });
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!canLike || pending || !commentId) return;
    const next = !state.liked;
    const previous = state;

    setPending(true);
    setState({ liked: next, likes: Math.max(0, previous.likes + (next ? 1 : -1)) });

    try {
      const res = await fetch(
        `/api/community/${encodeURIComponent(mediaType)}/${encodeURIComponent(tmdbId)}`
        + `/comments/${encodeURIComponent(commentId)}/like`,
        { method: next ? "POST" : "DELETE" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // El servidor manda el recuento autoritativo (incluye los me gusta que
      // llegaron de otros mientras tanto).
      setState({ liked: Boolean(data.liked), likes: Number(data.likes) || 0 });
    } catch {
      setState(previous);
    } finally {
      setPending(false);
    }
  };

  const active = state.liked;

  if (!canLike) {
    return (
      <span
        className={`flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-xs font-medium text-emerald-400 ${className}`}
      >
        <ThumbsUp className="h-3 w-3" aria-hidden="true" />
        <span className="tabular-nums">{state.likes}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={active}
      aria-label={active ? "Quitar me gusta" : "Me gusta"}
      className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:opacity-60 ${
        active
          ? "bg-emerald-400/15 text-emerald-300"
          : "bg-white/5 text-emerald-400 hover:bg-white/10"
      } ${className}`}
    >
      <ThumbsUp
        className={`h-3 w-3 transition-transform duration-200 ${active ? "scale-110 fill-current" : ""}`}
        aria-hidden="true"
      />
      <span className="tabular-nums">{state.likes}</span>
    </button>
  );
}
