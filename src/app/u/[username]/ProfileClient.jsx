"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import { useAuth } from "@/context/AuthContext";
import FollowButton from "@/components/social/FollowButton";
import PosterTile from "@/components/social/PosterTile";
import ProfileSection from "./ProfileSection";
import { Star, Settings, Loader2, Users } from "lucide-react";

// ─────────────────────────────────────────────
// Utilidades de presentación
// ─────────────────────────────────────────────

function getInitials(source) {
  return String(source || "TSV")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function ProfileAvatar({ user, size = "h-20 w-20 sm:h-24 sm:w-24" }) {
  return (
    <div className={`flex ${size} items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-xl font-black text-white ring-2 ring-white/10`}>
      {user?.avatarUrl ? (
        <OptimizedImage
          src={user.avatarUrl}
          alt={user?.displayName || user?.username || ""}
          className="h-full w-full object-cover"
          priority
        />
      ) : (
        <span>{getInitials(user?.displayName || user?.username)}</span>
      )}
    </div>
  );
}

function CountStat({ value, label, href }) {
  const body = (
    <>
      <span className="block text-xl font-black text-white sm:text-2xl">{value ?? 0}</span>
      <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="text-center transition-colors hover:text-emerald-400">
        {body}
      </Link>
    );
  }
  return <div className="text-center">{body}</div>;
}

function RatingHistogram({ histogram }) {
  const data = Array.isArray(histogram) ? histogram : [];
  const max = Math.max(1, ...data);
  const total = data.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="flex items-end gap-1" aria-hidden="true">
      <Star className="mb-1 h-3 w-3 fill-current text-emerald-400/70" />
      <div className="flex flex-1 items-end gap-[3px]" style={{ height: 56 }}>
        {data.map((n, i) => (
          <div
            key={i}
            title={`${i + 1}: ${n}`}
            className="flex-1 rounded-t-sm bg-gradient-to-t from-emerald-500/40 to-emerald-400/80"
            style={{ height: `${Math.max(3, (n / max) * 100)}%` }}
          />
        ))}
      </div>
      <span className="mb-0.5 inline-flex items-center gap-[1px] text-emerald-400">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="h-3 w-3 fill-current" />
        ))}
      </span>
    </div>
  );
}

function SectionHeader({ label, action }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
        {label}
      </h2>
      {action}
    </div>
  );
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export default function ProfileClient({ username }) {
  const { user: viewer } = useAuth();
  const [state, setState] = useState({ status: "loading", profile: null });
  const [tab, setTab] = useState("profile");

  // Al cambiar de usuario, volver a la pestaña de resumen.
  useEffect(() => setTab("profile"), [username]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", profile: null });
    (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/profile`, {
          cache: "no-store",
        });
        if (res.status === 404) {
          if (!cancelled) setState({ status: "notfound", profile: null });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setState({ status: "ready", profile: data.profile });
      } catch {
        if (!cancelled) setState({ status: "error", profile: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const { status, profile } = state;

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (status === "notfound") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <Users className="h-12 w-12 text-zinc-700" />
        <h1 className="text-2xl font-black text-white">Usuario no encontrado</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          No existe ningún miembro con el usuario{" "}
          <span className="text-zinc-300">@{username}</span>.
        </p>
        <Link
          href="/members"
          className="mt-2 inline-flex h-11 items-center rounded-full bg-emerald-500 px-6 text-sm font-bold text-black hover:bg-emerald-400"
        >
          Buscar miembros
        </Link>
      </div>
    );
  }

  if (status === "error" || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <h1 className="text-2xl font-black text-white">No se pudo cargar el perfil</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          Ha habido un problema temporal. Vuelve a intentarlo en un momento.
        </p>
      </div>
    );
  }

  const isSelf = Boolean(
    profile.isSelf || (viewer?.username && viewer.username === profile.user.username),
  );
  const { user, counts, favorites, recentWatched, followingPreview, stats, sections } = profile;

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-24">
      {/* Fondo decorativo sutil */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] left-[10%] h-[50vw] max-w-[700px] aspect-square rounded-full bg-emerald-600/10 blur-[130px]" />
        <div className="absolute bottom-[5%] right-[5%] h-[45vw] max-w-[600px] aspect-square rounded-full bg-emerald-800/10 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 lg:py-12">
        {/* ── CABECERA ── */}
        <header className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
          <ProfileAvatar user={user} />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
              <h1 className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
                {user.displayName}
              </h1>
              {isSelf ? (
                <Link
                  href="/profile/settings"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-bold text-zinc-300 hover:bg-white/10"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Editar perfil
                </Link>
              ) : (
                <FollowButton
                  username={user.username}
                  initialFollowing={profile.isFollowing}
                />
              )}
            </div>
            <p className="mt-0.5 text-sm text-zinc-500">@{user.username}</p>
            {user.bio && (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
                {user.bio}
              </p>
            )}
          </div>

          {/* Contadores */}
          <div className="flex items-center gap-5 sm:gap-6 sm:pl-4">
            <CountStat value={counts.films} label="Films" />
            <CountStat value={counts.thisYear} label="Este año" />
            <CountStat
              value={counts.following}
              label="Siguiendo"
              href={`/u/${user.username}/following`}
            />
            <CountStat
              value={counts.followers}
              label="Seguidores"
              href={`/u/${user.username}/followers`}
            />
          </div>
        </header>

        {/* ── BARRA DE PESTAÑAS ── */}
        <ProfileTabs tab={tab} setTab={setTab} sections={sections} />

        {tab !== "profile" ? (
          <div className="mt-8">
            {/* `key={tab}` remonta la sección al cambiar de pestaña: evita un
                render intermedio con el layout nuevo pero los items del layout
                anterior (que no comparten forma de `key`) → aviso de keys. */}
            <ProfileSection key={tab} username={user.username} section={tab} />
          </div>
        ) : (
        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_300px]">
          {/* ── COLUMNA PRINCIPAL ── */}
          <div className="space-y-10">
            {/* Favoritos curados */}
            <section>
              <SectionHeader label="Favoritos" />
              {favorites?.length ? (
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                  {favorites.map((item) => (
                    <PosterTile key={`${item.mediaType}:${item.tmdbId}`} item={item} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">
                  {isSelf
                    ? "Aún no has elegido tus títulos favoritos. Edítalos en Ajustes."
                    : "Este miembro todavía no ha destacado favoritos."}
                </p>
              )}
            </section>

            {/* Actividad reciente */}
            <section>
              <SectionHeader label="Actividad reciente" />
              {recentWatched?.length ? (
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                  {recentWatched.map((item) => (
                    <PosterTile
                      key={`${item.mediaType}:${item.tmdbId}`}
                      item={item}
                      showStars
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Sin actividad reciente.</p>
              )}
            </section>
          </div>

          {/* ── COLUMNA LATERAL ── */}
          <aside className="space-y-8">
            {/* Estadísticas */}
            <section>
              <SectionHeader label="Estadísticas" />
              <dl className="grid grid-cols-2 gap-3">
                <StatCell value={stats.films} label="Películas" />
                <StatCell value={stats.episodes} label="Episodios" />
                <StatCell value={stats.totalRatings} label="Puntuaciones" />
                <StatCell value={stats.thisYear} label="Este año" />
              </dl>
              {stats.totalRatings > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Puntuaciones
                  </p>
                  <RatingHistogram histogram={stats.ratingHistogram} />
                </div>
              )}
            </section>

            {/* Siguiendo (avatares) */}
            {followingPreview?.length > 0 && (
              <section>
                <SectionHeader
                  label="Siguiendo"
                  action={
                    <Link
                      href={`/u/${user.username}/following`}
                      className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 hover:text-emerald-400"
                    >
                      Ver todos
                    </Link>
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {followingPreview.map((f) => (
                    <Link
                      key={f.username}
                      href={`/u/${f.username}`}
                      title={f.displayName}
                      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-800 text-[10px] font-black text-white ring-1 ring-white/10 transition-transform hover:scale-110 hover:ring-emerald-400/50"
                    >
                      {f.avatarUrl ? (
                        <OptimizedImage
                          src={f.avatarUrl}
                          alt={f.displayName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span>{getInitials(f.displayName)}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
        )}
      </div>
    </div>
  );
}

// Barra de pestañas del perfil. "Perfil" = resumen; el resto muestra su conteo
// y carga su sección bajo demanda.
function ProfileTabs({ tab, setTab, sections }) {
  const items = [
    { id: "profile", label: "Perfil" },
    { id: "reviews", label: "Reseñas", count: sections?.reviews },
    { id: "watched", label: "Visionados", count: sections?.watched },
    { id: "watchlist", label: "Watchlist", count: sections?.watchlist },
    { id: "favorites", label: "Favoritos", count: sections?.favorites },
    { id: "ratings", label: "Puntuaciones", count: sections?.ratings },
    { id: "lists", label: "Listas", count: sections?.lists },
  ];
  return (
    <nav className="mt-8 flex gap-1 overflow-x-auto border-b border-white/10 pb-px [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => {
        const active = tab === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => setTab(it.id)}
            className={`relative flex-shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition-colors ${
              active ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {it.label}
            {typeof it.count === "number" && (
              <span className={`ml-1.5 text-xs font-semibold ${active ? "text-emerald-400" : "text-zinc-600"}`}>
                {it.count}
              </span>
            )}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-emerald-400" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

function StatCell({ value, label }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 text-center">
      <span className="block text-lg font-black text-white">{value ?? 0}</span>
      <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </span>
    </div>
  );
}
