"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import OptimizedImage from "@/components/OptimizedImage";
import LiquidButton from "@/components/LiquidButton";
import { useAuth } from "@/context/AuthContext";
import FollowButton from "@/components/social/FollowButton";
import PosterTile from "@/components/social/PosterTile";
import ProfileSection from "./ProfileSection";
import {
  Activity,
  Award,
  CalendarDays,
  ChevronRight,
  Clock3,
  Film,
  Flame,
  Loader2,
  LogOut,
  PieChart,
  RotateCcw,
  Settings,
  Star,
  Tv,
  Target,
  UserRoundCheck,
  Users,
} from "lucide-react";

const ChartLoading = ({ className = "h-[280px]" }) => (
  <div className={`${className} w-full animate-pulse rounded-2xl bg-white/[0.035]`} />
);
const MonthlyActivityChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.MonthlyActivityChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const TimeDistributionChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.TimeDistributionChart),
  { ssr: false, loading: () => <ChartLoading className="h-[250px]" /> },
);
const HourOfDayChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.HourOfDayChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const DayOfWeekChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.DayOfWeekChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const GenreRadarChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.GenreRadarChart),
  { ssr: false, loading: () => <ChartLoading /> },
);
const RatingsBarChart = dynamic(
  () => import("@/app/stats/profileCharts").then((module) => module.RatingsBarChart),
  { ssr: false, loading: () => <ChartLoading /> },
);

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

function CountStat({ value, label, href, icon: Icon, iconClassName = "text-emerald-400" }) {
  const className = "relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 px-4 py-3 text-center shadow-lg backdrop-blur-lg transition duration-300 hover:-translate-y-0.5 hover:from-white/[0.16] hover:to-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 sm:min-w-[120px] sm:px-5 sm:py-4";
  const body = (
    <>
      <span className={`relative z-10 mb-1 inline-flex h-7 w-7 items-center justify-center ${iconClassName}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="relative z-10 block text-xl font-black tracking-tight text-white drop-shadow-md sm:text-2xl lg:text-3xl">{value ?? 0}</span>
      <span className="relative z-10 mt-0.5 block text-[9px] font-bold uppercase tracking-wider text-zinc-300 sm:text-[10px]">
        {label}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

function SectionHeader({ label, action, onClick }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="group -my-1 -ml-1 inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-bold uppercase tracking-widest [font:inherit] transition-colors hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            <span>{label}</span>
            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </button>
        ) : label}
      </h2>
      {action}
    </div>
  );
}

function PendingPreview({ items, onOpen }) {
  const pendingItems = Array.isArray(items) ? items.slice(0, 5) : [];
  return (
    <section>
      <SectionHeader
        label="Pendientes"
        onClick={onOpen}
      />
      {pendingItems.length ? (
        <button
          type="button"
          onClick={onOpen}
          className="group relative block h-36 w-full overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          aria-label="Ver todos los títulos pendientes"
        >
          {pendingItems.map((item, index) => {
            const source = item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : null;
            return (
              <div
                key={`${item.mediaType}:${item.tmdbId}`}
                className="absolute bottom-[-0.65rem] aspect-[2/3] w-[30%] overflow-hidden rounded-t-xl bg-zinc-900 shadow-2xl ring-1 ring-white/10 transition-transform duration-300 group-hover:-translate-y-1"
                style={{ left: `${index * 18}%`, zIndex: index + 1 }}
              >
                {source ? (
                  <OptimizedImage
                    src={source}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-700">
                    <Film className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
              </div>
            );
          })}
          <span className="absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-black/80 to-transparent" aria-hidden="true" />
          <span className="absolute bottom-3 left-3 z-20 text-xs font-black text-white">
            {pendingItems.length} {pendingItems.length === 1 ? "título reciente" : "títulos recientes"}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex h-20 w-full items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-4 text-center text-xs font-semibold text-zinc-500 transition-colors hover:border-emerald-400/35 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          No hay títulos pendientes todavía.
        </button>
      )}
    </section>
  );
}

function buildHalfStarHistogram(histogram) {
  return Array.from({ length: 10 }, (_, index) => ({
    star: (index + 1) / 2,
    value: Number(histogram?.[index] || 0),
  })).filter((item) => Number.isFinite(item.value) && item.value > 0);
}

function formatStarValue(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function StarRatingHistogram({ histogram }) {
  const ratings = buildHalfStarHistogram(histogram);
  const max = Math.max(1, ...ratings.map((item) => item.value));
  if (!ratings.length) return null;

  return (
    <div className="flex h-20 items-end gap-1.5" aria-label="Distribución de puntuaciones por medias estrellas">
      <Star className="mb-1.5 h-3.5 w-3.5 shrink-0 fill-emerald-400 text-emerald-400" aria-hidden="true" />
      <ul className="flex h-full min-w-0 flex-1 items-end gap-1" role="list">
        {ratings.map((item) => {
          const starText = `${formatStarValue(item.star)} ${item.star === 1 ? "estrella" : "estrellas"}`;
          const label = `${item.value} valoraciones con ${starText}`;
          return (
            <li
              key={item.star}
              className="group relative flex h-full min-w-0 flex-1 items-end"
              title={label}
            >
              <span className="pointer-events-none absolute bottom-[calc(100%+0.45rem)] left-1/2 z-10 w-max -translate-x-1/2 rounded-lg border border-white/10 bg-slate-700 px-2.5 py-1.5 text-center text-[10px] font-bold text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                <span className="block">{item.value} valoraciones</span>
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-emerald-300">
                  <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  <span className="text-zinc-100">{starText}</span>
                </span>
              </span>
              <span
                className="block w-full rounded-t-sm bg-gradient-to-t from-slate-500/85 to-slate-300/90 transition-transform duration-200 group-hover:scale-x-110 group-hover:from-emerald-500/80 group-hover:to-emerald-300"
                style={{ height: `${Math.max(5, (item.value / max) * 100)}%` }}
                aria-hidden="true"
              />
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ul>
      <span className="mb-1 inline-flex shrink-0 items-center gap-px text-emerald-400" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className="h-3 w-3 fill-current" />
        ))}
      </span>
    </div>
  );
}

// Mientras el endpoint público se actualiza con las métricas agregadas, el
// perfil propio puede seguir usando la fuente privada que ya alimentaba la
// página Profile anterior. Solo se transforma información agregada para las
// gráficas, sin alterar el resto de la vista social.
function buildAnalyticsFromPrivateProfile(payload) {
  if (!payload || typeof payload !== "object") return null;

  const now = new Date();
  const months = new Map();
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.set(key, {
      date: key,
      label: new Intl.DateTimeFormat("es-ES", { month: "short" }).format(date).replace(".", ""),
      movies: 0,
      episodes: 0,
      total: 0,
    });
  }

  const dayOfWeek = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((name) => ({ name, value: 0 }));
  const hourOfDay = Array.from({ length: 24 }, (_, hour) => ({ name: `${hour}h`, value: 0 }));
  for (const item of Array.isArray(payload.history) ? payload.history : []) {
    const date = new Date(item?.watched_at || item?.watchedAt || "");
    if (Number.isNaN(date.getTime()) || date > now) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const month = months.get(key);
    if (month) {
      if (item?.type === "movie" || item?.mediaType === "movie") month.movies += 1;
      else month.episodes += 1;
      month.total += 1;
    }
    dayOfWeek[date.getDay()].value += 1;
    hourOfDay[date.getHours()].value += 1;
  }

  const genreEntries = Array.isArray(payload.genres)
    ? payload.genres.map((item) => [item?.name, item?.value ?? item?.count])
    : Object.entries(payload.genres || {});
  const genres = genreEntries
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .filter((item) => item.name && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const ratings = Object.entries(payload.stats?.ratings?.distribution || {})
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .sort((a, b) => Number(a.name) - Number(b.name));
  const ratingCount = ratings.reduce((sum, item) => sum + item.value, 0);
  const monthlyActivity = [...months.values()];
  const top = (items) => items.reduce((best, item) => item.value > (best?.value || 0) ? item : best, null);
  const movieMinutes = Number(payload.stats?.movies?.minutes || 0);
  const episodeMinutes = Number(payload.stats?.episodes?.minutes || 0);
  const totalMinutes = movieMinutes + episodeMinutes;

  return {
    totalMinutes,
    formattedTotalTime: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
    monthlyActivity,
    timeDistribution: [
      { name: "Películas", value: movieMinutes, color: "#3b82f6" },
      { name: "Series", value: episodeMinutes, color: "#a855f7" },
    ],
    dayOfWeek,
    hourOfDay,
    genres,
    ratings,
    insights: {
      currentStreak: 0,
      bestStreak: 0,
      averageRating: ratingCount
        ? ratings.reduce((sum, item) => sum + Number(item.name) * item.value, 0) / ratingCount
        : null,
      topGenre: genres[0] || null,
      topDay: top(dayOfWeek)?.value ? top(dayOfWeek) : null,
      peakHour: top(hourOfDay)?.value ? top(hourOfDay) : null,
    },
  };
}

// ─────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────

export default function ProfileClient({ username }) {
  const { user: viewer, logout } = useAuth();
  const [state, setState] = useState({ status: "loading", profile: null });
  const [tab, setTab] = useState("profile");
  const [refreshToken, setRefreshToken] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [privateAnalytics, setPrivateAnalytics] = useState(null);

  // Al cambiar de usuario, volver a la pestaña de resumen.
  useEffect(() => setTab("profile"), [username]);

  useEffect(() => {
    let cancelled = false;
    const isRefresh = refreshToken > 0;
    if (!isRefresh) setState({ status: "loading", profile: null });
    else setSyncing(true);
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
        if (!cancelled && !isRefresh) setState({ status: "error", profile: null });
      } finally {
        if (!cancelled && isRefresh) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, refreshToken]);

  useEffect(() => {
    const currentProfile = state.profile;
    const isOwnProfile = Boolean(
      currentProfile?.isSelf ||
      (viewer?.username && viewer.username === currentProfile?.user?.username),
    );
    if (!isOwnProfile || currentProfile?.analytics) {
      setPrivateAnalytics(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/profile?posters=0", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = await response.json();
        const analytics = buildAnalyticsFromPrivateProfile(payload);
        if (!cancelled && analytics) setPrivateAnalytics(analytics);
      } catch {
        // Las gráficas permanecen disponibles cuando la API pública ya trae
        // analytics; este fallback no debe degradar la página si falla.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.profile, viewer?.username, refreshToken]);

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
  const {
    user,
    counts,
    favorites,
    recentWatched,
    pendingPreview,
    followingPreview,
    stats,
    analytics,
    sections,
  } = profile;
  const resolvedAnalytics = analytics || privateAnalytics;
  const collectionCount = Number(sections?.favorites || 0) + Number(sections?.watchlist || 0);

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-24">
      {/* Fondo decorativo sutil */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] left-[10%] h-[50vw] max-w-[700px] aspect-square rounded-full bg-emerald-600/10 blur-[130px]" />
        <div className="absolute bottom-[5%] right-[5%] h-[45vw] max-w-[600px] aspect-square rounded-full bg-emerald-800/10 blur-[130px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1500px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {/* ── CABECERA ── */}
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <ProfileAvatar user={user} size="h-20 w-20 self-center sm:h-24 sm:w-24 lg:self-auto" />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start sm:gap-4">
              <h1 className="min-w-0 text-[clamp(2.25rem,4.1vw,3.5rem)] font-black leading-[0.92] tracking-[-0.06em] text-white">
                {user.displayName}<span className="text-emerald-400">.</span>
              </h1>
              {isSelf ? (
                <div className="flex shrink-0 items-center gap-2" aria-label="Acciones de perfil">
                  <LiquidButton
                    onClick={() => window.location.assign("/profile/settings")}
                    disabled={syncing}
                    activeColor="teal"
                    groupId="profile-header-actions"
                    title="Configuración"
                  className="!border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent shadow-lg backdrop-blur-md hover:!bg-white/15"
                  >
                    <Settings className="h-5 w-5" />
                  </LiquidButton>
                  <LiquidButton
                    onClick={() => setRefreshToken((value) => value + 1)}
                    disabled={syncing}
                    loading={syncing}
                    activeColor="green"
                    groupId="profile-header-actions"
                    title="Sincronizar"
                    className="!border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent shadow-lg backdrop-blur-md hover:!bg-white/15"
                  >
                    <RotateCcw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />
                  </LiquidButton>
                  <LiquidButton
                    onClick={() => logout({ redirectTo: "/login" })}
                    disabled={syncing}
                    activeColor="red"
                    groupId="profile-header-actions"
                    title="Desconectar"
                    className="!border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent !text-red-400 shadow-lg backdrop-blur-md hover:!bg-white/15 hover:!text-red-300"
                  >
                    <LogOut className="h-5 w-5" />
                  </LiquidButton>
                </div>
              ) : (
                <FollowButton
                  username={user.username}
                  initialFollowing={profile.isFollowing}
                />
              )}
            </div>
            <p className="mt-2 text-sm font-semibold tracking-tight text-zinc-500">@{user.username}</p>
            {user.bio && (
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">
                {user.bio}
              </p>
            )}
          </div>

          {/* Contadores */}
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4 sm:gap-3 lg:pl-4">
            <CountStat value={counts.films} label="Películas" icon={Film} iconClassName="text-sky-400" />
            <CountStat value={stats.episodes} label="Episodios" icon={Tv} iconClassName="text-violet-400" />
            <CountStat
              value={counts.following}
              label="Siguiendo"
              icon={UserRoundCheck}
              iconClassName="text-emerald-400"
              href={`/u/${user.username}/following`}
            />
            <CountStat
              value={counts.followers}
              label="Seguidores"
              icon={Users}
              iconClassName="text-amber-400"
              href={`/u/${user.username}/followers`}
            />
          </div>
        </header>

        {/* ── BARRA DE PESTAÑAS ── */}
        <ProfileTabs tab={tab} setTab={setTab} sections={sections} />

        {tab === "statistics" ? (
          <div className="mt-8">
            {resolvedAnalytics ? (
              <ProfileAnalytics analytics={resolvedAnalytics} />
            ) : (
              <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center">
                <Activity className="h-7 w-7 text-emerald-400/70" />
                <h2 className="mt-4 text-lg font-black text-white">Estadísticas en preparación</h2>
                <p className="mt-1 max-w-sm text-sm text-zinc-500">
                  Este miembro todavía no tiene datos suficientes para mostrar sus gráficas.
                </p>
              </section>
            )}
          </div>
        ) : tab !== "profile" ? (
          <div className="mt-8">
            {/* `key={tab}` remonta la sección al cambiar de pestaña: evita un
                render intermedio con el layout nuevo pero los items del layout
                anterior (que no comparten forma de `key`) → aviso de keys. */}
            <ProfileSection key={tab} username={user.username} section={tab} />
          </div>
        ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
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
          <aside className="space-y-8 xl:sticky xl:top-24 xl:self-start">
            {/* Estadísticas */}
            <section>
              <SectionHeader
                label="Estadísticas"
                onClick={() => setTab("statistics")}
              />
              <dl className="grid grid-cols-2 gap-3">
                <StatCell value={stats.totalRatings} label="Valoraciones" />
                <StatCell value={collectionCount} label="Colección" />
                <StatCell value={resolvedAnalytics?.shows || 0} label="Series" />
                <StatCell value={formatProfileTime(resolvedAnalytics?.totalMinutes)} label="Tiempo visto" />
              </dl>
            </section>

            <section>
              <SectionHeader
                label="Puntuaciones"
                onClick={() => setTab("ratings")}
              />
              {stats.totalRatings > 0 ? (
                <StarRatingHistogram histogram={stats.ratingHistogram} />
              ) : (
                <button
                  type="button"
                  onClick={() => setTab("ratings")}
                  className="flex h-20 w-full items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-4 text-center text-xs font-semibold text-zinc-500 transition-colors hover:border-emerald-400/35 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                >
                  Aún no hay puntuaciones.
                </button>
              )}
            </section>

            <PendingPreview items={pendingPreview} onOpen={() => setTab("watchlist")} />

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
    { id: "statistics", label: "Estadísticas" },
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

function formatProfileTime(minutes) {
  const value = Math.max(0, Number(minutes || 0));
  if (value < 60) return `${value} min`;
  return `${Math.floor(value / 60)} h`;
}

function AnalyticsCard({ title, subtitle, icon: Icon, iconClassName = "text-emerald-400", children, className = "" }) {
  return (
    <section
      className={`min-w-0 rounded-2xl border border-white/[0.075] bg-white/[0.025] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-5 ${className}`}
    >
      <div className="mb-3 flex items-center gap-3">
        {Icon && (
          <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] ${iconClassName}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div>
        <h2 className="text-sm font-black text-white">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ProfileAnalytics({ analytics }) {
  const hasActivity = analytics.monthlyActivity?.some((item) => item.total > 0);
  return (
    <section className="space-y-4">
      <SectionHeader label="Actividad y estadísticas" />
      <div className="grid min-w-0 gap-4 xl:grid-cols-12">
        <AnalyticsCard
          title="Actividad mensual"
          subtitle="Últimos doce meses"
          icon={Activity}
          iconClassName="text-indigo-400"
          className="xl:col-span-6"
        >
          {hasActivity ? (
            <MonthlyActivityChart data={analytics.monthlyActivity} />
          ) : (
            <EmptyChart message="Aún no hay actividad para representar." />
          )}
        </AnalyticsCard>
        <AnalyticsCard
          title="Tiempo de visionado"
          subtitle="Películas frente a series"
          icon={PieChart}
          iconClassName="text-violet-400"
          className="xl:col-span-3"
        >
          {analytics.totalMinutes > 0 ? (
            <TimeDistributionChart
              data={analytics.timeDistribution || []}
              formattedTotalTime={analytics.formattedTotalTime || "0h 0m"}
            />
          ) : (
            <EmptyChart message="Aún no hay tiempo de visionado registrado." />
          )}
        </AnalyticsCard>
        <aside
          aria-label="Resumen de hábitos"
          className="grid min-w-0 grid-cols-2 gap-2 xl:col-span-3"
        >
          <HabitMetrics insights={analytics.insights} />
        </aside>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <AnalyticsCard title="Hora del día" subtitle="Cuándo hay más actividad" icon={Clock3} iconClassName="text-pink-400">
          {hasActivity ? <HourOfDayChart data={analytics.hourOfDay || []} /> : <EmptyChart />}
        </AnalyticsCard>
        <AnalyticsCard title="Día de la semana" subtitle="Ritmo semanal" icon={CalendarDays} iconClassName="text-cyan-400">
          {hasActivity ? <DayOfWeekChart data={analytics.dayOfWeek || []} /> : <EmptyChart />}
        </AnalyticsCard>
        <AnalyticsCard title="Gustos por género" subtitle="Las categorías más frecuentes" icon={Target} iconClassName="text-lime-400">
          {analytics.genres?.length ? <GenreRadarChart data={analytics.genres} /> : <EmptyChart />}
        </AnalyticsCard>
        <AnalyticsCard title="Puntuaciones" subtitle="Distribución de notas">
          {analytics.ratings?.length ? <RatingsBarChart data={analytics.ratings} /> : <EmptyChart />}
        </AnalyticsCard>
      </div>
    </section>
  );
}

function EmptyChart({ message = "Todavía no hay datos suficientes." }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed border-white/[0.08] px-6 text-center text-sm text-zinc-600">
      {message}
    </div>
  );
}

function HabitMetrics({ insights = {} }) {
  const items = [
    { icon: Flame, label: "Racha actual", value: `${insights.currentStreak || 0} días`, tone: "orange" },
    { icon: Award, label: "Mejor racha", value: `${insights.bestStreak || 0} días`, tone: "rose" },
    { icon: Star, label: "Nota media", value: insights.averageRating != null ? insights.averageRating.toFixed(1) : "—", tone: "amber" },
    { icon: Activity, label: "Género top", value: insights.topGenre?.name || "—", tone: "emerald" },
    { icon: CalendarDays, label: "Día favorito", value: insights.topDay?.name || "—", tone: "sky" },
    { icon: Clock3, label: "Hora punta", value: insights.peakHour?.name || "—", tone: "violet" },
  ];

  return items.map(({ icon, label, value, tone }) => (
    <HabitMetric key={label} icon={icon} label={label} value={value} tone={tone} />
  ));
}

function HabitMetric({ icon: Icon, label, value, tone = "emerald" }) {
  const toneClass = {
    amber: "text-amber-300",
    emerald: "text-emerald-300",
    orange: "text-orange-300",
    rose: "text-rose-300",
    sky: "text-sky-300",
    violet: "text-violet-300",
  }[tone] || "text-emerald-300";

  return (
    <div
      className="relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-2 py-2.5 text-center shadow-lg backdrop-blur-lg transition duration-300 hover:-translate-y-0.5 hover:from-white/[0.16] hover:to-white/[0.07]"
      aria-label={`${label}: ${value}`}
    >
      <span className={`relative z-10 mb-1 inline-flex h-6 w-6 items-center justify-center ${toneClass}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="relative z-10 block max-w-full truncate text-base font-black tracking-tight text-white drop-shadow-md sm:text-lg">
        {value}
      </span>
      <span className="relative z-10 mt-0.5 block max-w-full truncate text-[8px] font-bold uppercase tracking-wider text-zinc-300 sm:text-[9px]">
        {label}
      </span>
    </div>
  );
}
