"use client";

// src/components/community/ListLikeButton.jsx
// Me gusta en una lista de la comunidad.
//
// Mismo trato que el de las reseñas: optimista, reversible y idempotente en el
// servidor. Sin sesión enseña el recuento pero no invita a pulsar.

import { useState } from "react";
import { Heart } from "lucide-react";

export default function ListLikeButton({
  listId,
  likes = 0,
  liked = false,
  canLike = false,
  className = "",
}) {
  const [state, setState] = useState({ liked: Boolean(liked), likes: Number(likes) || 0 });
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    if (!canLike || pending || !listId) return;
    const next = !state.liked;
    const previous = state;

    setPending(true);
    setState({ liked: next, likes: Math.max(0, previous.likes + (next ? 1 : -1)) });

    try {
      const res = await fetch(`/api/community/lists/${encodeURIComponent(listId)}/like`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ liked: Boolean(data.liked), likes: Number(data.likes) || 0 });
    } catch {
      setState(previous);
    } finally {
      setPending(false);
    }
  };

  const active = state.liked;
  const shared = "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold transition-colors";

  if (!canLike) {
    return (
      <span className={`${shared} bg-white/[0.06] text-zinc-300 ${className}`}>
        <Heart className="h-4 w-4" aria-hidden="true" />
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
      className={`${shared} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70 disabled:opacity-60 ${
        active
          ? "bg-pink-500/20 text-pink-300"
          : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-pink-300"
      } ${className}`}
    >
      <Heart
        className={`h-4 w-4 transition-transform duration-200 ${active ? "scale-110 fill-current" : ""}`}
        aria-hidden="true"
      />
      <span className="tabular-nums">{state.likes}</span>
      <span className="sr-only">{active ? "Quitar me gusta de la lista" : "Me gusta a la lista"}</span>
    </button>
  );
}
