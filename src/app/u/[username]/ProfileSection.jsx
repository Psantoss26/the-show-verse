"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OptimizedImage from "@/components/OptimizedImage";
import {
  BookmarkPlus,
  Eye,
  Heart,
  ImageOff,
  ListPlus,
  ListVideo,
  Loader2,
  MessageSquare,
} from "lucide-react";
import MemberRow from "@/components/social/MemberRow";
import PosterTile from "@/components/social/PosterTile";
import Stars from "@/components/social/Stars";
import { titleStateKey, useViewerTitleStates } from "@/components/social/useViewerTitleStates";
import { useAuth } from "@/context/AuthContext";

// Configuración por sección: tipo de layout + textos.
const SECTIONS = {
  watched: { layout: "posters", showStars: true, empty: "Sin visionados." },
  watchlist: { layout: "posters", showStars: false, empty: "La watchlist está vacía." },
  favorites: { layout: "posters", showStars: false, empty: "Sin favoritos." },
  ratings: { layout: "posters", showStars: true, empty: "Sin puntuaciones." },
  reviews: { layout: "reviews", empty: "Sin reseñas." },
  lists: { layout: "lists", empty: "Sin listas públicas." },
  activity: { layout: "activity", empty: "Aún no hay actividad pública." },
};

function relativeActivityTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function ActivityAvatar({ actor }) {
  const name = actor?.displayName || actor?.username || "Usuario";
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900 text-[10px] font-black text-zinc-300">
      {actor?.avatarUrl ? (
        <OptimizedImage src={actor.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}

function ActivityTitle({ item, className = "" }) {
  if (!item.tmdbId || !item.mediaType) return null;
  const type = item.mediaType === "tv" ? "tv" : "movie";
  return (
    <Link href={`/details/${type}/${item.tmdbId}`} className={`font-bold text-white transition-colors hover:text-emerald-300 ${className}`}>
      {item.title || "Ver ficha"}
    </Link>
  );
}

function ActivityReview({ item, actor }) {
  const [showSpoiler, setShowSpoiler] = useState(false);
  const type = item.mediaType === "tv" ? "tv" : "movie";
  const src = item.posterPath ? `https://image.tmdb.org/t/p/w185${item.posterPath}` : null;

  return (
    <article className="rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.07] via-white/[0.035] to-transparent p-4 shadow-[0_16px_38px_rgba(0,0,0,0.2)] sm:p-5">
      <div className="flex gap-3 sm:gap-4">
        <ActivityAvatar actor={actor} />
        <Link href={`/details/${type}/${item.tmdbId}`} className="hidden h-28 w-[76px] shrink-0 overflow-hidden rounded-lg bg-zinc-900 ring-1 ring-white/10 sm:block">
          {src ? (
            <OptimizedImage src={src} alt={item.title || ""} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-zinc-700"><ImageOff className="h-5 w-5" /></span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-300">{actor?.displayName || actor?.username || "Este usuario"}</span>
            <span>ha reseñado</span>
            <ActivityTitle item={item} />
            {typeof item.rating === "number" && <Stars rating={item.rating} />}
          </div>
          {item.spoiler && !showSpoiler ? (
            <button type="button" onClick={() => setShowSpoiler(true)} className="mt-3 text-xs font-bold uppercase tracking-widest text-amber-300 transition-colors hover:text-amber-200">
              Contiene spoilers — mostrar reseña
            </button>
          ) : (
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-200 sm:text-[15px] sm:leading-7">{item.body}</p>
          )}
          <time dateTime={item.createdAt} className="mt-3 block text-xs font-medium text-zinc-500">
            {relativeActivityTime(item.createdAt)}
          </time>
        </div>
      </div>
    </article>
  );
}

function ActivityRow({ item, actor }) {
  const definitions = {
    watched: { icon: Eye, tone: "text-emerald-300", text: "ha visto" },
    watchlist: { icon: BookmarkPlus, tone: "text-sky-300", text: "ha añadido a Pendientes" },
    favorite: { icon: Heart, tone: "text-red-300", text: "ha añadido a Favoritos" },
    rating: { tone: "text-amber-300", text: "ha puntuado" },
    list: { icon: ListPlus, tone: "text-violet-300", text: "ha creado la lista" },
    list_item: { icon: ListPlus, tone: "text-violet-300", text: "ha añadido a una lista" },
  };
  const definition = definitions[item.type] || definitions.watched;
  const Icon = definition.icon;
  const episodeLabel = item.type === "watched" && item.season && item.episode
    ? `S${String(item.season).padStart(2, "0")}E${String(item.episode).padStart(2, "0")} de `
    : "";

  return (
    <article className="flex min-w-0 items-center gap-3 border-b border-white/[0.07] px-3 py-3 last:border-b-0 sm:px-4">
      <ActivityAvatar actor={actor} />
      {item.type === "rating" ? (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center text-xl font-black leading-none tabular-nums ${definition.tone}`} aria-hidden="true">
          {item.rating}
        </span>
      ) : (
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${definition.tone}`} aria-hidden="true">
          <Icon className={`h-5 w-5 ${item.type === "favorite" || item.type === "watchlist" ? "fill-current" : ""}`} />
        </span>
      )}
      <p className="min-w-0 flex-1 text-sm leading-5 text-zinc-400">
        <span className="font-semibold text-zinc-300">{actor?.displayName || actor?.username || "Este usuario"}</span>{" "}
        {definition.text}{" "}
        {episodeLabel}
        {item.type === "list" ? (
          <Link href={`/lists/${item.id.replace("list:", "")}`} className="font-bold text-white hover:text-emerald-300">{item.name}</Link>
        ) : (
          <ActivityTitle item={item} />
        )}
        {item.type === "list_item" && item.listName ? <span className="text-zinc-500"> · {item.listName}</span> : null}
      </p>
      <time dateTime={item.createdAt} className="shrink-0 text-xs font-medium text-zinc-600" title={new Date(item.createdAt).toLocaleString("es-ES")}>
        {relativeActivityTime(item.createdAt)}
      </time>
    </article>
  );
}

function ActivityFeed({ items, actor }) {
  return (
    <ol className="space-y-3" role="list">
      {items.map((item) => (
        <li key={item.id}>
          {item.type === "review" ? <ActivityReview item={item} actor={actor} /> : <ActivityRow item={item} actor={actor} />}
        </li>
      ))}
    </ol>
  );
}
const EMPTY_SOCIAL_RELATION = Object.freeze({ users: [], hasMore: false, offset: 0 });

function ReviewCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const type = item.mediaType === "tv" ? "tv" : "movie";
  const src = item.posterPath
    ? `https://image.tmdb.org/t/p/w185${item.posterPath}`
    : null;
  return (
    <div className="flex gap-4 rounded-xl bg-zinc-900/40 p-4 shadow-sm transition-all hover:bg-zinc-900/60">
      <Link
        href={`/details/${type}/${item.tmdbId}`}
        className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-sm"
      >
        {src ? (
          <OptimizedImage src={src} alt={item.title || ""} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ImageOff className="h-5 w-5" />
          </div>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/details/${type}/${item.tmdbId}`}
            className="text-sm font-bold text-white hover:text-emerald-400"
          >
            {item.title || "Ver ficha"}
          </Link>
          {typeof item.rating === "number" && <Stars rating={item.rating} />}
        </div>
        {item.spoiler && !expanded ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 text-xs font-bold uppercase tracking-widest text-amber-400/80 hover:text-amber-300"
          >
            Contiene spoilers — mostrar
          </button>
        ) : (
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
            {item.body}
          </p>
        )}
      </div>
    </div>
  );
}

function ProfileListCard({ item }) {
  const posters = Array.isArray(item.previewPosters) ? item.previewPosters.slice(0, 5) : [];
  return (
    <Link
      href={`/lists/${item.id}`}
      className="group block rounded-xl bg-zinc-900/40 p-4 shadow-sm transition-all hover:bg-zinc-900/60"
    >
      <div className="mb-3 flex items-center gap-1.5">
        {posters.length ? (
          posters.map((p, i) => (
            <div
              key={i}
              className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-zinc-900 shadow-sm"
              style={{ marginLeft: i === 0 ? 0 : -14, zIndex: 10 - i }}
            >
              <OptimizedImage
                src={`https://image.tmdb.org/t/p/w185${p}`}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))
        ) : (
          <div className="flex h-16 w-11 items-center justify-center rounded-xl bg-zinc-900 text-zinc-700">
            <ListVideo className="h-5 w-5" />
          </div>
        )}
      </div>
      <p className="truncate text-sm font-bold text-white group-hover:text-emerald-400">
        {item.name}
      </p>
      <p className="text-xs text-zinc-500">
        {item.itemCount} {item.itemCount === 1 ? "título" : "títulos"}
      </p>
      {item.description && (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{item.description}</p>
      )}
    </Link>
  );
}

function ProfileContentSection({ username, section, actor }) {
  const { user: viewer } = useAuth();
  const config = SECTIONS[section];
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const viewerTitleStates = useViewerTitleStates(items, Boolean(viewer?.username));

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setItems([]);
    setOffset(0);
    (async () => {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(username)}/${section}?limit=30&offset=0`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setItems(Array.isArray(data.items) ? data.items : []);
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
  }, [username, section]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(username)}/${section}?limit=30&offset=${offset}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      setItems((prev) => [...prev, ...(Array.isArray(data.items) ? data.items : [])]);
      setHasMore(Boolean(data.hasMore));
      setOffset(Number(data.offset) || offset);
    } catch {
      // reintentar manualmente
    } finally {
      setLoadingMore(false);
    }
  };

  if (!config) return null;

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        No se pudo cargar esta sección. Inténtalo de nuevo.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <MessageSquare className="h-10 w-10 text-zinc-700" />
        <p className="text-sm text-zinc-500">{config.empty}</p>
      </div>
    );
  }

  return (
    <div>
      {config.layout === "posters" && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {items.map((item) => (
            <PosterTile
              key={`${item.mediaType}:${item.tmdbId}`}
              item={item}
              showStars={config.showStars}
              viewerState={viewerTitleStates[titleStateKey(item)]}
            />
          ))}
        </div>
      )}

      {config.layout === "reviews" && (
        <div className="space-y-3">
          {items.map((item) => (
            <ReviewCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {config.layout === "lists" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ProfileListCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {config.layout === "activity" && <ActivityFeed items={items} actor={actor} />}

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 text-sm font-bold text-zinc-300 hover:bg-white/10 disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Cargar más
        </button>
      )}
    </div>
  );
}

function SocialColumn({ title, empty, relation, data, loadingMore, onLoadMore }) {
  return (
    <section className="min-w-0 rounded-xl bg-zinc-900/30 p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 border-b border-white/10 pb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">
        {title}
      </h2>
      {data.users.length ? (
        <div className="space-y-2">
          {data.users.map((member) => (
            <MemberRow key={member.username} member={member} />
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-zinc-500">{empty}</p>
      )}
      {data.hasMore && (
        <button
          type="button"
          onClick={() => onLoadMore(relation)}
          disabled={loadingMore}
          className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-bold text-zinc-300 transition-colors hover:bg-white/[0.09] disabled:opacity-60"
        >
          {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Cargar más
        </button>
      )}
    </section>
  );
}

function ProfileSocialSection({ username }) {
  const [relations, setRelations] = useState({
    followers: EMPTY_SOCIAL_RELATION,
    following: EMPTY_SOCIAL_RELATION,
  });
  const [status, setStatus] = useState("loading");
  const [loadingMore, setLoadingMore] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setRelations({ followers: EMPTY_SOCIAL_RELATION, following: EMPTY_SOCIAL_RELATION });
    (async () => {
      try {
        const fetchRelation = async (relation) => {
          const response = await fetch(
            `/api/users/${encodeURIComponent(username)}/${relation}?limit=30&offset=0`,
            { cache: "no-store" },
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          return {
            users: Array.isArray(payload.users) ? payload.users : [],
            hasMore: Boolean(payload.hasMore),
            offset: Number(payload.offset) || 0,
          };
        };
        const [followers, following] = await Promise.all([
          fetchRelation("followers"),
          fetchRelation("following"),
        ]);
        if (!cancelled) {
          setRelations({ followers, following });
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const loadMore = async (relation) => {
    const current = relations[relation];
    if (!current?.hasMore || loadingMore) return;
    setLoadingMore(relation);
    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(username)}/${relation}?limit=30&offset=${current.offset}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setRelations((previous) => ({
        ...previous,
        [relation]: {
          users: [...current.users, ...(Array.isArray(payload.users) ? payload.users : [])],
          hasMore: Boolean(payload.hasMore),
          offset: Number(payload.offset) || current.offset,
        },
      }));
    } catch {
      // El botón se mantiene disponible para reintentar la carga.
    } finally {
      setLoadingMore(null);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <p className="py-16 text-center text-sm text-zinc-500">
        No se pudo cargar la información social. Inténtalo de nuevo.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <SocialColumn
        title="Seguidores"
        relation="followers"
        data={relations.followers}
        empty="Todavía no tiene seguidores."
        loadingMore={loadingMore === "followers"}
        onLoadMore={loadMore}
      />
      <SocialColumn
        title="Siguiendo"
        relation="following"
        data={relations.following}
        empty="Todavía no sigue a nadie."
        loadingMore={loadingMore === "following"}
        onLoadMore={loadMore}
      />
    </div>
  );
}

export default function ProfileSection({ username, section, actor }) {
  if (section === "social") return <ProfileSocialSection username={username} />;
  return <ProfileContentSection username={username} section={section} actor={actor} />;
}
