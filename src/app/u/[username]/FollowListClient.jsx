"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Users } from "lucide-react";
import MemberRow from "@/components/social/MemberRow";

// Lista de seguidores o "siguiendo" de un usuario. `relation` = 'followers' | 'following'.
export default function FollowListClient({ username, relation }) {
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState("loading");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const title = relation === "followers" ? "Seguidores" : "Siguiendo";

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setMembers([]);
    setOffset(0);
    (async () => {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(username)}/${relation}?limit=30&offset=0`,
          { cache: "no-store" },
        );
        if (res.status === 404) {
          if (!cancelled) setStatus("notfound");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setMembers(Array.isArray(data.users) ? data.users : []);
        setHasMore(Boolean(data.hasMore));
        setOffset(Number(data.offset) || 0);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, relation]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/${relation}?limit=30&offset=${offset}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setMembers((prev) => [...prev, ...(Array.isArray(data.users) ? data.users : [])]);
      setHasMore(Boolean(data.hasMore));
      setOffset(Number(data.offset) || offset);
    } catch {
      // se ignora; el usuario puede reintentar
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-24">
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3">
          <Link
            href={`/u/${username}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
            aria-label="Volver al perfil"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-black text-white">{title}</h1>
            <p className="text-sm text-zinc-500">@{username}</p>
          </div>
        </div>

        {status === "loading" && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
          </div>
        )}

        {status === "notfound" && (
          <p className="py-16 text-center text-sm text-zinc-500">Usuario no encontrado.</p>
        )}

        {status === "error" && (
          <p className="py-16 text-center text-sm text-zinc-500">
            No se pudo cargar la lista. Inténtalo de nuevo.
          </p>
        )}

        {status === "ready" && members.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-zinc-700" />
            <p className="text-sm text-zinc-500">
              {relation === "followers"
                ? "Todavía no tiene seguidores."
                : "Todavía no sigue a nadie."}
            </p>
          </div>
        )}

        {status === "ready" && members.length > 0 && (
          <div className="space-y-2">
            {members.map((m) => (
              <MemberRow key={m.username} member={m} />
            ))}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60"
              >
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Cargar más
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
