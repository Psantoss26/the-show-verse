"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Users } from "lucide-react";
import MemberRow from "@/components/social/MemberRow";

export default function MembersClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const reqIdRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setStatus("idle");
      return undefined;
    }

    setStatus("loading");
    const reqId = ++reqIdRef.current;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // Solo aplica el último resultado (evita respuestas fuera de orden).
        if (reqId !== reqIdRef.current) return;
        setResults(Array.isArray(data.results) ? data.results : []);
        setStatus("ready");
      } catch {
        if (reqId !== reqIdRef.current) return;
        setStatus("error");
      }
    }, 280);

    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-24">
      <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:py-12">
        <header className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <div className="h-px w-12 bg-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              Red social
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Miembros<span className="text-emerald-500">.</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Busca a otros miembros por nombre o usuario y síguelos.
          </p>
        </header>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar miembros…"
            autoFocus
            className="h-12 w-full rounded-full border border-white/10 bg-white/5 pl-12 pr-12 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-emerald-400/50 focus:bg-white/[0.07]"
          />
          {status === "loading" && (
            <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-emerald-400" />
          )}
        </div>

        <div className="mt-6">
          {status === "idle" && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Users className="h-10 w-10 text-zinc-700" />
              <p className="text-sm text-zinc-500">
                Escribe para empezar a buscar miembros.
              </p>
            </div>
          )}

          {status === "error" && (
            <p className="py-16 text-center text-sm text-zinc-500">
              No se pudo buscar. Inténtalo de nuevo.
            </p>
          )}

          {status === "ready" && results.length === 0 && (
            <p className="py-16 text-center text-sm text-zinc-500">
              No hay miembros que coincidan con «{query.trim()}».
            </p>
          )}

          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((m) => (
                <MemberRow key={m.username} member={m} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
