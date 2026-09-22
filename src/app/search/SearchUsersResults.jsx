"use client";

// Resultados de usuarios de la página de búsqueda. Va en cliente porque la
// búsqueda de miembros pasa por la sesión del backend (cookies), igual que en el
// desplegable de la navbar. El backend no pagina esta búsqueda: se piden los
// primeros 50, muchos más de los que cabían en el desplegable.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, SearchX } from "lucide-react";
import Avatar from "@/components/ui/Avatar";

const USERS_LIMIT = 50;

export default function SearchUsersResults({ query }) {
  const [state, setState] = useState({ loading: true, error: false, users: [] });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: false, users: [] });
    const params = new URLSearchParams({ q: query, limit: String(USERS_LIMIT) });
    fetch(`/api/users/search?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const users = (payload?.results || []).filter((u) => u?.username);
        setState({ loading: false, error: false, users });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState({ loading: false, error: true, users: [] });
      });
    return () => controller.abort();
  }, [query]);

  if (state.loading) {
    return (
      <div className="flex justify-center py-16 text-zinc-400" role="status">
        <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="sr-only">Buscando usuarios…</span>
      </div>
    );
  }

  if (state.error || state.users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-black/20 p-10 text-center">
        <SearchX className="mb-4 h-10 w-10 text-zinc-500" aria-hidden="true" />
        <h2 className="text-lg font-bold text-zinc-200">
          {state.error ? "No se pudo buscar usuarios" : "No hay usuarios con ese nombre"}
        </h2>
        {state.error && (
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            Inicia sesión o inténtalo de nuevo en unos segundos.
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {state.users.map((user) => {
        const name = user.displayName || user.username;
        return (
          <li key={user.id || user.username}>
            <Link
              href={`/u/${encodeURIComponent(user.username)}`}
              className="flex items-center gap-4 rounded-2xl bg-white/[0.04] p-3 transition-colors hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-neutral-900">
                <Avatar src={user.avatarUrl} name={name} width={48} height={48} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-white">{name}</span>
                <span className="block truncate text-xs text-zinc-400">@{user.username}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
