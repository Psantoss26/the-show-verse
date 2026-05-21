// ActorDetails.jsx
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/swiper-bundle.css";
import { motion, useReducedMotion } from "framer-motion";
import {
  ImageOff,
  Link as LinkIcon,
  ExternalLink,
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  Globe,
  Film,
  Tv as Tv2,
  User,
  Cake,
  Skull,
  Briefcase,
  TrendingUp,
  Star,
  Search,
  SlidersHorizontal,
  Images,
  Tags,
  ChevronDown,
  Calendar,
  ArrowUpRight,
} from "lucide-react";
import {
  AnimatedSection,
  FadeIn,
  ScaleIn,
  StaggerContainer,
} from "@/components/details/AnimatedSection";
import DetailsSectionMenu from "./DetailsSectionMenu";

/* --- CONFIG & UTILS --- */
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";

const tmdbImg = (path, size = "original") =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const safeText = (v, fallback = "—") =>
  v == null || v === "" ? fallback : String(v);

const genderLabel = (g) => {
  if (g === 1) return "Mujer";
  if (g === 2) return "Hombre";
  if (g === 3) return "No binario";
  return "N/A";
};

const calcAge = (birthday, deathday) => {
  if (!birthday) return null;
  const b = new Date(birthday);
  if (Number.isNaN(b.getTime())) return null;
  const end = deathday ? new Date(deathday) : new Date();
  if (Number.isNaN(end.getTime())) return null;
  let age = end.getFullYear() - b.getFullYear();
  const m = end.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) age--;
  return Number.isFinite(age) ? age : null;
};

const yearFromDate = (s) => {
  if (!s) return null;
  const y = String(s).slice(0, 4);
  return /^\d{4}$/.test(y) ? Number(y) : null;
};

const formatHumanDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.status_message || "Error TMDb");
  return json;
}

/* --- UI COMPONENTS --- */

function SectionTitle({ title, subtitle, icon: Icon, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/5 border border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_-3px_rgba(52,211,153,0.2)]">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="flex flex-col">
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

// Custom select wrapper
function SelectInput({
  value,
  onChange,
  options,
  icon: Icon,
  placeholder = "Seleccionar",
  className = "",
}) {
  return (
    <div className={`relative group ${className}`}>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none group-focus-within:text-emerald-400 transition-colors">
        {Icon ? (
          <Icon className="w-4 h-4" />
        ) : (
          <SlidersHorizontal className="w-4 h-4" />
        )}
      </div>
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none bg-zinc-900/80 border border-zinc-800 hover:border-zinc-600 text-zinc-200 text-sm rounded-xl py-2.5 pl-9 pr-8 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all cursor-pointer"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 pointer-events-none group-hover:text-zinc-400" />
    </div>
  );
}

/**
 * PosterCard (CRÉDITOS EN PANTALLA)
 * Solo muestra la portada por defecto
 * Título/“como …”/año/puntuación SOLO en hover/focus
 * La puntuación en hover es la de estos créditos (vote_average)
 */
function PosterCard({ item }) {
  const title = item?.title || item?.name || "Sin título";
  const poster = tmdbImg(item?.poster_path || item?.profile_path, "w500");
  const subtitle = item?.subtitle || "";
  const year = item?.year || yearFromDate(item?.date) || null;
  const mediaType = item?.media_type === "tv" ? "tv" : "movie";
  const href =
    mediaType === "movie"
      ? `/details/movie/${item?.id}`
      : `/details/tv/${item?.id}`;

  const rating = Number(item?.vote_average ?? item?.rating ?? 0);
  const hasRating = Number.isFinite(rating) && rating > 0;

  return (
    <Link
      href={href}
      prefetch={false}
      className="group block relative w-full"
      aria-label={title}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/5 group-hover:ring-emerald-500/35 transition-all duration-300">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 bg-zinc-900">
            <ImageOff className="w-10 h-10 mb-2 opacity-50" />
            <span className="text-[10px] uppercase font-bold tracking-widest">
              No Image
            </span>
          </div>
        )}

        {/* Hover / focus overlay (sin repetir texto fuera) */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300">
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

          {/* Rating SOLO en hover (créditos en pantalla) */}
          {hasRating && (
            <div className="absolute top-2 right-2 translate-y-1 opacity-0 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-300">
              <div className="px-2 py-1 rounded-full bg-black/65 backdrop-blur border border-white/10 text-[11px] font-extrabold text-white inline-flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                {rating.toFixed(1)}
              </div>
            </div>
          )}

          <div className="absolute left-0 right-0 bottom-0 p-4">
            <div className="translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 transition-all duration-300">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-emerald-400 text-[11px] font-extrabold uppercase tracking-wider">
                  {mediaType === "tv" ? "Serie" : "Película"}
                </span>
                {year ? (
                  <span className="text-[11px] text-zinc-300/80 font-semibold">
                    · {year}
                  </span>
                ) : null}
              </div>

              <div className="text-white text-sm font-extrabold leading-snug line-clamp-2">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-xs text-zinc-300/85 line-clamp-1">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Accesibilidad (sin UI visible) */}
      <span className="sr-only">{title}</span>
    </Link>
  );
}

/* --- MAIN COMPONENT --- */

export default function ActorDetails({ actorDetails, actorMovies }) {
  const personId = actorDetails?.id;

  // UI States
  const [showFullBio, setShowFullBio] = useState(false);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [extraErr, setExtraErr] = useState("");

  // Data States
  const [externalIds, setExternalIds] = useState(null);
  const [combinedCredits, setCombinedCredits] = useState(null);
  const [images, setImages] = useState(null);
  const [taggedImages, setTaggedImages] = useState(null);
  const [translations, setTranslations] = useState(null);

  // Filter States (Créditos)
  const [q, setQ] = useState("");
  const [mediaFilter, setMediaFilter] = useState("all");
  const [creditFilter, setCreditFilter] = useState("acting");
  const [deptFilter, setDeptFilter] = useState("all");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sort, setSort] = useState("date_desc");

  const profileSrc = tmdbImg(actorDetails?.profile_path, "h632");
  const tmdbUrl = personId
    ? `https://www.themoviedb.org/person/${personId}`
    : null;

  // ====== Poster 3D Tilt ======
  const posterWrapRef = useRef(null);
  const posterTiltRef = useRef(null);
  const posterAnimRafRef = useRef(0);
  const posterTargetRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterStateRef = useRef({ rx: 0, ry: 0, s: 1 });
  const posterIsInteractingRef = useRef(false);

  const prefersReducedMotion = useReducedMotion();
  const [poster3dEnabled, setPoster3dEnabled] = useState(false);

  const POSTER_MAX = 10;
  const POSTER_SCALE = 1.03;

  useEffect(() => {
    if (prefersReducedMotion) {
      setPoster3dEnabled(false);
      return;
    }
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setPoster3dEnabled(media.matches);
    update();
    if (media.addEventListener) media.addEventListener("change", update);
    else media.addListener(update);
    return () => {
      if (media.removeEventListener)
        media.removeEventListener("change", update);
      else media.removeListener(update);
    };
  }, [prefersReducedMotion]);

  const kickPosterAnimation = useCallback(() => {
    if (!poster3dEnabled || posterAnimRafRef.current) return;
    const el = posterTiltRef.current;
    if (!el) return;

    const loop = () => {
      const cur = posterStateRef.current;
      const target = posterTargetRef.current;
      const k = posterIsInteractingRef.current ? 0.18 : 0.14;

      cur.rx += (target.rx - cur.rx) * k;
      cur.ry += (target.ry - cur.ry) * k;
      cur.s += (target.s - cur.s) * k;

      el.style.transform =
        `translateZ(0px) rotateX(${cur.rx.toFixed(3)}deg) rotateY(${cur.ry.toFixed(3)}deg) ` +
        `scale3d(${cur.s.toFixed(4)}, ${cur.s.toFixed(4)}, ${cur.s.toFixed(4)})`;

      const isSettled =
        Math.abs(target.rx - cur.rx) < 0.02 &&
        Math.abs(target.ry - cur.ry) < 0.02 &&
        Math.abs(target.s - cur.s) < 0.002;

      if (posterIsInteractingRef.current || !isSettled) {
        posterAnimRafRef.current = window.requestAnimationFrame(loop);
      } else {
        posterAnimRafRef.current = 0;
      }
    };
    posterAnimRafRef.current = window.requestAnimationFrame(loop);
  }, [poster3dEnabled]);

  const setPosterTargetFromPointer = useCallback(
    (clientX, clientY) => {
      if (!poster3dEnabled) return;
      const wrapper = posterWrapRef.current;
      if (!wrapper) return;

      const rect = wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      const rx = ((y - cy) / cy) * -POSTER_MAX;
      const ry = ((x - cx) / cx) * POSTER_MAX;

      posterIsInteractingRef.current = true;
      posterTargetRef.current = { rx, ry, s: POSTER_SCALE };
      kickPosterAnimation();
    },
    [kickPosterAnimation, poster3dEnabled],
  );

  const resetPosterTarget = useCallback(() => {
    posterIsInteractingRef.current = false;
    posterTargetRef.current = { rx: 0, ry: 0, s: 1 };
    kickPosterAnimation();
  }, [kickPosterAnimation]);

  useEffect(() => {
    const el = posterTiltRef.current;
    if (!el) return;

    if (!poster3dEnabled) {
      el.style.transform =
        "translateZ(0px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
      if (posterAnimRafRef.current) {
        window.cancelAnimationFrame(posterAnimRafRef.current);
        posterAnimRafRef.current = 0;
      }
      return;
    }

    posterIsInteractingRef.current = false;
    posterTargetRef.current = { rx: 0, ry: 0, s: 1 };
    posterStateRef.current = { rx: 0, ry: 0, s: 1 };
    el.style.transform =
      "translateZ(0px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";

    return () => {
      if (posterAnimRafRef.current) {
        window.cancelAnimationFrame(posterAnimRafRef.current);
        posterAnimRafRef.current = 0;
      }
    };
  }, [poster3dEnabled, profileSrc]);

  const loadAll = useCallback(async () => {
    if (!TMDB_API_KEY || !personId) return;
    setLoadingExtra(true);
    setExtraErr("");
    const qs = `api_key=${encodeURIComponent(TMDB_API_KEY)}`;
    const lang = `&language=es-ES`;

    const endpoints = {
      external: `${TMDB_BASE}/person/${personId}/external_ids?${qs}`,
      combined: `${TMDB_BASE}/person/${personId}/combined_credits?${qs}${lang}`,
      images: `${TMDB_BASE}/person/${personId}/images?${qs}`,
      tagged: `${TMDB_BASE}/person/${personId}/tagged_images?${qs}&page=1`,
      translations: `${TMDB_BASE}/person/${personId}/translations?${qs}`,
    };

    const settled = await Promise.allSettled([
      fetchJson(endpoints.external),
      fetchJson(endpoints.combined),
      fetchJson(endpoints.images),
      fetchJson(endpoints.tagged),
      fetchJson(endpoints.translations),
    ]);

    const [ex, cc, im, tg, tr] = settled;
    const firstErr = settled.find((r) => r.status === "rejected")?.reason
      ?.message;
    if (firstErr) setExtraErr(firstErr);

    if (ex.status === "fulfilled") setExternalIds(ex.value);
    if (cc.status === "fulfilled") setCombinedCredits(cc.value);
    if (im.status === "fulfilled") setImages(im.value);
    if (tg.status === "fulfilled") setTaggedImages(tg.value);
    if (tr.status === "fulfilled") setTranslations(tr.value);

    setLoadingExtra(false);
  }, [personId]);

  useEffect(() => {
    setQ("");
    setMediaFilter("all");
    setCreditFilter("acting");
    setDeptFilter("all");
    setYearFrom("");
    setYearTo("");
    setSort("date_desc");
    setShowFullBio(false);
    if (personId && TMDB_API_KEY) loadAll();
  }, [personId, loadAll]);

  // --- Computed Data ---
  const creditsAll = useMemo(() => {
    if (combinedCredits?.cast || combinedCredits?.crew) {
      const cast = (combinedCredits.cast || []).map((c) => ({
        ...c,
        kind: "acting",
        department: "Acting",
      }));
      const crew = (combinedCredits.crew || []).map((c) => ({
        ...c,
        kind: "crew",
        department: c.department || "Crew",
      }));

      return [...cast, ...crew]
        .filter((x) => x?.id)
        .map((c) => {
          const media_type =
            c.media_type || (c.first_air_date ? "tv" : "movie");
          const date = media_type === "tv" ? c.first_air_date : c.release_date;
          return {
            ...c,
            media_type,
            year: yearFromDate(date),
            date,
            subtitle: c.character ? `como ${c.character}` : c.job ? c.job : "",
          };
        });
    }

    // Fallback
    return (Array.isArray(actorMovies) ? actorMovies : [])
      .map((m) => ({
        ...m,
        kind: "acting",
        department: "Acting",
        media_type: "movie",
        year: yearFromDate(m.release_date),
        date: m.release_date,
        subtitle: m.character ? `como ${m.character}` : "",
      }))
      .filter((x) => x.id);
  }, [combinedCredits, actorMovies]);

  const deptOptions = useMemo(() => {
    const set = new Set(
      creditsAll.filter((c) => c.kind === "crew").map((c) => c.department),
    );
    return Array.from(set)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [creditsAll]);

  const yearOptions = useMemo(() => {
    const set = new Set(creditsAll.map((c) => c.year).filter((y) => y > 0));
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ value: String(y), label: String(y) }));
  }, [creditsAll]);

  const filteredCredits = useMemo(() => {
    let out = [...creditsAll];
    const needle = q.trim().toLowerCase();

    if (mediaFilter !== "all")
      out = out.filter((x) => x.media_type === mediaFilter);
    if (creditFilter !== "all")
      out = out.filter((x) => x.kind === creditFilter);
    if (creditFilter === "crew" && deptFilter !== "all")
      out = out.filter((x) => x.department === deptFilter);
    if (yearFrom)
      out = out.filter((x) => (x.year || -Infinity) >= Number(yearFrom));
    if (yearTo) out = out.filter((x) => (x.year || Infinity) <= Number(yearTo));
    if (needle) {
      out = out.filter((x) => {
        const t = String(x.title || x.name || "").toLowerCase();
        const s = String(x.subtitle || "").toLowerCase();
        return t.includes(needle) || s.includes(needle);
      });
    }

    const byDate = (x) => (x.date ? new Date(x.date).getTime() : -Infinity);

    if (sort === "date_desc") out.sort((a, b) => byDate(b) - byDate(a));
    else if (sort === "date_asc") out.sort((a, b) => byDate(a) - byDate(b));
    else if (sort === "pop_desc")
      out.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    else if (sort === "rating_desc")
      out.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    else if (sort === "alpha")
      out.sort((a, b) =>
        String(a.title || a.name || "").localeCompare(
          String(b.title || b.name || ""),
        ),
      );

    return out;
  }, [
    creditsAll,
    q,
    mediaFilter,
    creditFilter,
    deptFilter,
    yearFrom,
    yearTo,
    sort,
  ]);

  const stats = useMemo(
    () => ({
      total: creditsAll.length,
      movies: creditsAll.filter((x) => x.media_type === "movie").length,
      tv: creditsAll.filter((x) => x.media_type === "tv").length,
      acting: creditsAll.filter((x) => x.kind === "acting").length,
      crew: creditsAll.filter((x) => x.kind === "crew").length,
    }),
    [creditsAll],
  );

  const socials = useMemo(() => {
    const ex = externalIds || {};
    const imdb = actorDetails?.imdb_id || ex?.imdb_id;
    return {
      imdb: imdb ? `https://www.imdb.com/name/${imdb}` : null,
      instagram: ex?.instagram_id
        ? `https://www.instagram.com/${ex.instagram_id}`
        : null,
      twitter: ex?.twitter_id ? `https://twitter.com/${ex.twitter_id}` : null,
      facebook: ex?.facebook_id
        ? `https://www.facebook.com/${ex.facebook_id}`
        : null,
      youtube: ex?.youtube_id
        ? `https://www.youtube.com/${ex.youtube_id}`
        : null,
      homepage: actorDetails?.homepage,
      tmdb: tmdbUrl,
    };
  }, [externalIds, actorDetails, tmdbUrl]);

  const age = calcAge(actorDetails?.birthday, actorDetails?.deathday);
  const esBio = translations?.translations?.find((t) => t.iso_639_1 === "es")
    ?.data?.biography;
  const bio = esBio || actorDetails?.biography || "";
  const photos = (images?.profiles || []).sort(
    (a, b) => (b.vote_count || 0) - (a.vote_count || 0),
  );

  const taggedCount = taggedImages?.results?.length || 0;
  const photosCount = photos.length;

  const clearFilters = () => {
    setQ("");
    setMediaFilter("all");
    setCreditFilter("acting");
    setDeptFilter("all");
    setYearFrom("");
    setYearTo("");
    setSort("date_desc");
  };

  // --- “Más populares” (sin scrollbar, más compacto, con títulos con espacio) ---
  const popularItems = useMemo(() => {
    return creditsAll
      .filter((x) => x.poster_path && x.kind === "acting")
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 5);
  }, [creditsAll]);

  // hero background
  const heroBackgroundPath =
    taggedImages?.results?.[0]?.file_path ||
    images?.profiles?.[0]?.file_path ||
    actorDetails?.profile_path;

  const heroBackgroundStyle = useMemo(() => {
    if (!heroBackgroundPath) return null;
    return {
      backgroundImage: `url(https://image.tmdb.org/t/p/original${heroBackgroundPath})`,
    };
  }, [heroBackgroundPath]);

  const sectionItems = useMemo(() => {
    const items = [];
    if (popularItems.length > 0)
      items.push({ id: "popular", label: "Destacados", icon: Star });
    if (stats.total > 0)
      items.push({
        id: "credits",
        label: "Créditos",
        icon: Film,
        count: stats.total,
      });
    if (photosCount > 0)
      items.push({
        id: "photos",
        label: "Fotos",
        icon: Images,
        count: photosCount,
      });
    if (taggedCount > 0)
      items.push({
        id: "tagged",
        label: "En medios",
        icon: Tags,
        count: taggedCount,
      });
    items.push({ id: "about", label: "Perfil", icon: User });
    return items;
  }, [popularItems.length, stats.total, photosCount, taggedCount]);

  const STICKY_TOP = 72;
  const sentinelRef = useRef(null);
  const menuStickyRef = useRef(null);
  const sectionElsRef = useRef({});

  const [menuCompact, setMenuCompact] = useState(false);
  const [menuH, setMenuH] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState(null);

  const registerSection = useCallback(
    (sid) => (el) => {
      if (el) sectionElsRef.current[sid] = el;
    },
    [],
  );

  useEffect(() => {
    if (!menuStickyRef.current) return;
    const el = menuStickyRef.current;
    const update = () => setMenuH(el.getBoundingClientRect().height || 0);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setMenuCompact(!entry.isIntersecting);
      },
      {
        threshold: 0,
        root: null,
        rootMargin: `-${STICKY_TOP}px 0px 0px 0px`,
      },
    );
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, []);

  const scrollToSection = useCallback(
    (sid) => {
      const el =
        sectionElsRef.current[sid] || document.getElementById(`section-${sid}`);
      if (!el) return;

      const offset = STICKY_TOP + (menuH || 0) + 10;
      const y = window.scrollY + el.getBoundingClientRect().top - offset;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    },
    [menuH],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = (sectionItems || []).map((x) => x?.id).filter(Boolean);
    if (!ids.length) return;

    let raf = 0;
    const compute = () => {
      const offset = STICKY_TOP + (menuH || 0) + 16;
      let current = ids[0];

      for (const sid of ids) {
        const el = sectionElsRef.current[sid];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = sid;
        else break;
      }

      setActiveSectionId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [sectionItems, menuH]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
        {heroBackgroundStyle ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                ...heroBackgroundStyle,
                transform: "scale(1)",
                filter: "blur(14px) brightness(0.65) saturate(1.05)",
              }}
            />
            <div
              className="absolute inset-0 bg-cover transition-opacity duration-1000"
              style={{
                ...heroBackgroundStyle,
                backgroundPosition: "center top",
                transform: "scale(1)",
                transformOrigin: "center top",
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[#0a0a0a]" />
        )}

        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-l from-[#101010]/60 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#101010] via-[#101010]/60 to-black/20 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#101010] via-transparent to-transparent opacity-30" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 lg:pt-12 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col lg:flex-row gap-8 lg:gap-12 mb-12 items-start transform-gpu"
        >
          {/* --- COLUMNA IZQUIERDA: POSTER + SOCIALS --- */}
          <div className="w-full max-w-[280px] lg:max-w-[320px] mx-auto lg:mx-0 flex-shrink-0 flex flex-col gap-5 relative z-10 transition-[max-width] duration-500 ease-out">
            {/* Profile Image */}
            <div className="relative">
              <div
                ref={posterWrapRef}
                onPointerMove={(e) =>
                  setPosterTargetFromPointer(e.clientX, e.clientY)
                }
                onPointerLeave={resetPosterTarget}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  setPosterTargetFromPointer(e.clientX, e.clientY);
                }}
                className="relative"
                style={{
                  perspective: poster3dEnabled ? 1100 : undefined,
                  transformStyle: "preserve-3d",
                  touchAction: "none",
                }}
              >
                <div
                  ref={posterTiltRef}
                  className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/10 bg-black/40 aspect-[2/3] will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    outline: "1px solid transparent",
                    isolation: "isolate",
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10 z-20" />
                  <div className="relative w-full h-full bg-neutral-950 z-10 overflow-hidden">
                    {profileSrc ? (
                      <img
                        src={profileSrc}
                        alt={actorDetails?.name}
                        className="w-full h-full object-cover"
                        style={{
                          transform: poster3dEnabled
                            ? "scale(1.08)"
                            : "scale(1)",
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <User className="w-16 h-16" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Social Links under profile picture like DetailsClient providers */}
            {socials && Object.values(socials).some(Boolean) && (
              <StaggerContainer
                className="flex flex-row flex-wrap justify-center items-center gap-3 w-full px-1 py-2"
                staggerDelay={0.05}
              >
                {Object.entries(socials).map(([key, url], index) => {
                  if (!url) return null;
                  let Icon = Globe;
                  if (key === "imdb") Icon = LinkIcon;
                  if (key === "instagram") Icon = Instagram;
                  if (key === "twitter") Icon = Twitter;
                  if (key === "facebook") Icon = Facebook;
                  if (key === "youtube") Icon = Youtube;
                  if (key === "tmdb") Icon = ExternalLink;

                  return (
                    <motion.a
                      key={key}
                      href={url}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.28,
                        delay: 0.03 + index * 0.04,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      target="_blank"
                      rel="noreferrer"
                      title={key.charAt(0).toUpperCase() + key.slice(1)}
                      className="group relative flex items-center justify-center w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 hover:bg-zinc-800 transition-all duration-300 transform hover:scale-110"
                    >
                      <Icon className="w-4 h-4 lg:w-5 lg:h-5" />
                    </motion.a>
                  );
                })}
              </StaggerContainer>
            )}
          </div>

          {/* --- COLUMNA DERECHA: INFO --- */}
          <div className="flex-1 flex flex-col min-w-0 w-full">
            <FadeIn delay={0.06} className="mb-5 px-1">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1] tracking-tight text-balance drop-shadow-xl mb-3 text-center md:text-left">
                {safeText(actorDetails?.name)}
              </h1>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 text-base md:text-lg font-medium text-zinc-300">
                {actorDetails?.birthday && (
                  <span className="flex items-center gap-1.5">
                    <Cake className="w-4 h-4 text-zinc-500" />
                    {formatHumanDate(actorDetails.birthday)}
                    {age && (
                      <span className="text-emerald-400 font-semibold">
                        ({age} años)
                      </span>
                    )}
                  </span>
                )}
                {actorDetails?.deathday && (
                  <span className="flex items-center gap-1.5 text-red-400">
                    <Skull className="w-4 h-4" />†{" "}
                    {formatHumanDate(actorDetails.deathday)}
                  </span>
                )}
                {actorDetails?.place_of_birth && (
                  <span className="hidden sm:flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-zinc-700" />
                    {actorDetails.place_of_birth}
                  </span>
                )}
              </div>
            </FadeIn>

            <ScaleIn delay={0.18} className="mb-6">
              <div className="w-full border border-white/10 bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden p-4 flex gap-4 overflow-x-auto no-scrollbar items-center">
                <div className="shrink-0 flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    Conocido/a por
                  </span>
                  <span className="text-white text-sm font-semibold">
                    {actorDetails?.known_for_department || "—"}
                  </span>
                </div>
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="shrink-0 flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    Créditos Totales
                  </span>
                  <span className="text-white text-sm font-semibold">
                    {stats.total}
                  </span>
                </div>
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="shrink-0 flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    Actuación
                  </span>
                  <span className="text-white text-sm font-semibold">
                    {stats.acting}
                  </span>
                </div>
                <div className="w-px h-6 bg-white/10 shrink-0" />
                <div className="shrink-0 flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    Equipo Técnico
                  </span>
                  <span className="text-white text-sm font-semibold">
                    {stats.crew}
                  </span>
                </div>
                <div className="w-px h-8 bg-white/10 shrink-0" />
                <div className="shrink-0 flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-rose-400" />
                  <div className="flex flex-col">
                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                      Popularidad
                    </span>
                    <span className="text-white text-sm font-semibold">
                      {Math.round(actorDetails?.popularity || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </ScaleIn>

            <FadeIn delay={0.24}>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/5 relative">
                <p
                  className={`text-zinc-200 text-base leading-relaxed text-justify whitespace-pre-line ${
                    !showFullBio && bio.length > 420
                      ? "line-clamp-4 mask-fade-bottom"
                      : ""
                  }`}
                >
                  {bio || (
                    <span className="italic text-zinc-500">
                      Sin biografía disponible.
                    </span>
                  )}
                </p>
                {bio.length > 420 && (
                  <button
                    onClick={() => setShowFullBio(!showFullBio)}
                    className="mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wide flex items-center gap-1"
                  >
                    {showFullBio ? "Ver menos" : "Leer más"}{" "}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform ${showFullBio ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
            </FadeIn>
          </div>
        </motion.div>

        {/* =================================================================
            MENÚ DE NAVEGACIÓN STICKY Y SECCIONES DE CONTENIDO
           ================================================================= */}
        <div className="mt-8 sm:mt-10">
          <div ref={sentinelRef} className="h-px w-full" />
          <div
            ref={menuStickyRef}
            className="sticky z-30 py-2"
            style={{
              top: STICKY_TOP,
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          >
            <DetailsSectionMenu
              items={sectionItems}
              activeId={activeSectionId}
              onChange={scrollToSection}
              colorScheme="emerald"
            />
          </div>

          <div className="mt-6 space-y-14">
            {popularItems.length > 0 && (
              <section id="section-popular" ref={registerSection("popular")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16">
                    <SectionTitle title="Destacados" icon={Star} />
                    <Swiper
                      spaceBetween={12}
                      slidesPerView={3}
                      breakpoints={{
                        500: { slidesPerView: 3, spaceBetween: 14 },
                        768: { slidesPerView: 4, spaceBetween: 16 },
                        1024: { slidesPerView: 5, spaceBetween: 18 },
                        1280: { slidesPerView: 6, spaceBetween: 20 },
                      }}
                      className="pb-8"
                    >
                      {popularItems.map((item) => (
                        <SwiperSlide key={`popular-${item.id}`}>
                          <PosterCard item={item} />
                        </SwiperSlide>
                      ))}
                    </Swiper>
                  </section>
                </AnimatedSection>
              </section>
            )}

            <section id="section-credits" ref={registerSection("credits")}>
              <AnimatedSection delay={0.04}>
                <section className="mb-16">
                  <SectionTitle
                    title="Créditos en pantalla"
                    subtitle={`${filteredCredits.length} de ${stats.total} resultados`}
                    icon={Film}
                    right={
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-xs font-bold text-zinc-200"
                        title="Limpiar filtros"
                      >
                        Limpiar
                      </button>
                    }
                  />

                  {/* Filters */}
                  <div className="bg-zinc-900/45 border border-white/5 rounded-2xl p-4 mb-6 backdrop-blur-sm">
                    {/* Search */}
                    <div className="relative group">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-emerald-400 transition-colors" />
                      <input
                        type="text"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Buscar por título o rol…"
                        className="w-full bg-black/35 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                      />
                    </div>

                    {/* One-line controls */}
                    <div className="mt-3 flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
                      <SelectInput
                        className="min-w-[165px] shrink-0"
                        value={mediaFilter}
                        onChange={(e) => setMediaFilter(e.target.value)}
                        options={[
                          { label: "Tipo (todos)", value: "all" },
                          { label: "Películas", value: "movie" },
                          { label: "Series", value: "tv" },
                        ]}
                        placeholder="Tipo"
                      />

                      <SelectInput
                        className="min-w-[175px] shrink-0"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                        options={[
                          { label: "Más recientes", value: "date_desc" },
                          { label: "Más antiguos", value: "date_asc" },
                          { label: "Popularidad", value: "pop_desc" },
                          { label: "Mejor valorados", value: "rating_desc" },
                          { label: "A-Z", value: "alpha" },
                        ]}
                        icon={ArrowUpRight}
                        placeholder="Orden"
                      />

                      <SelectInput
                        className="min-w-[165px] shrink-0"
                        value={yearFrom}
                        onChange={(e) => setYearFrom(e.target.value)}
                        options={yearOptions}
                        icon={Calendar}
                        placeholder="Desde (cualquiera)"
                      />

                      <SelectInput
                        className="min-w-[165px] shrink-0"
                        value={yearTo}
                        onChange={(e) => setYearTo(e.target.value)}
                        options={yearOptions}
                        icon={Calendar}
                        placeholder="Hasta (cualquiera)"
                      />

                      <SelectInput
                        className="min-w-[170px] shrink-0"
                        value={creditFilter}
                        onChange={(e) => {
                          setCreditFilter(e.target.value);
                          if (e.target.value !== "crew") setDeptFilter("all");
                        }}
                        options={[
                          { label: "Actuación", value: "acting" },
                          { label: "Equipo", value: "crew" },
                          { label: "Todos", value: "all" },
                        ]}
                        placeholder="Rol"
                      />

                      {creditFilter === "crew" && (
                        <SelectInput
                          className="min-w-[200px] shrink-0"
                          value={deptFilter}
                          onChange={(e) => setDeptFilter(e.target.value)}
                          options={[
                            { label: "Dept. (todos)", value: "all" },
                            ...deptOptions,
                          ]}
                          placeholder="Departamento"
                        />
                      )}
                    </div>
                  </div>

                  {/* Grid */}
                  {filteredCredits.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">
                      {filteredCredits.map((c) => (
                        <PosterCard
                          key={`${c.id}-${c.credit_id || "x"}-${c.media_type || "m"}`}
                          item={c}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-16 text-center border border-dashed border-white/10 rounded-3xl bg-white/5">
                      <Film className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                      <p className="text-zinc-400">
                        No se encontraron créditos con estos filtros.
                      </p>
                      <button
                        onClick={clearFilters}
                        className="mt-4 text-sm text-emerald-400 hover:underline"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </section>
              </AnimatedSection>
            </section>

            {photos.length > 0 && (
              <section id="section-photos" ref={registerSection("photos")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16">
                    <SectionTitle
                      title="Fotos"
                      subtitle={`${photos.length} imágenes`}
                      icon={Images}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {photos.map((p) => (
                        <a
                          key={p.file_path}
                          href={tmdbImg(p.file_path, "original")}
                          target="_blank"
                          rel="noreferrer"
                          className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-emerald-500/50 transition-colors"
                        >
                          <img
                            src={tmdbImg(p.file_path, "w500")}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur rounded text-[10px] text-white font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                            {p.width}x{p.height}
                          </div>
                        </a>
                      ))}
                    </div>
                  </section>
                </AnimatedSection>
              </section>
            )}

            {taggedImages?.results?.length > 0 && (
              <section id="section-tagged" ref={registerSection("tagged")}>
                <AnimatedSection delay={0.04}>
                  <section className="mb-16">
                    <SectionTitle
                      title="Apariciones en medios"
                      subtitle="Imágenes donde aparece etiquetado/a"
                      icon={Tags}
                    />
                    <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
                      {taggedImages.results.map((t) => (
                        <a
                          key={t.file_path}
                          href={tmdbImg(t.file_path, "original")}
                          target="_blank"
                          rel="noreferrer"
                          className="break-inside-avoid relative group rounded-xl overflow-hidden border border-white/10 bg-zinc-900/40 hover:border-emerald-500/40 transition-colors block"
                        >
                          <img
                            src={tmdbImg(t.file_path, "w500")}
                            alt=""
                            className="w-full h-auto"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ExternalLink className="w-6 h-6 text-white" />
                          </div>
                          {(t.media?.title || t.media?.name) && (
                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent text-xs text-white line-clamp-1">
                              {t.media.title || t.media.name}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </section>
                </AnimatedSection>
              </section>
            )}

            <section id="section-about" ref={registerSection("about")}>
              <AnimatedSection delay={0.04}>
                <section className="mb-16">
                  <SectionTitle
                    title="Perfil"
                    subtitle="Datos del actor/actriz"
                    icon={User}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="p-5 rounded-2xl bg-zinc-900/45 border border-white/5 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">
                        Información
                      </h3>
                      <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                        <span className="text-zinc-400">Género</span>
                        <span className="text-white text-right">
                          {genderLabel(actorDetails?.gender)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                        <span className="text-zinc-400">Lugar</span>
                        <span className="text-white text-right max-w-[60%] truncate">
                          {safeText(actorDetails?.place_of_birth)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-white/5 pb-2 gap-4">
                        <span className="text-zinc-400">Conocido/a por</span>
                        <span className="text-white text-right">
                          {safeText(actorDetails?.known_for_department)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-zinc-400">TMDb ID</span>
                        <span className="text-white font-mono">
                          {safeText(actorDetails?.id)}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 rounded-2xl bg-zinc-900/45 border border-white/5 space-y-4">
                      <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">
                        Enlaces & Alias
                      </h3>

                      <div className="flex flex-wrap gap-2">
                        {Object.entries(socials).map(([key, url]) =>
                          url ? (
                            <a
                              key={key}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-zinc-800/70 hover:bg-emerald-500/15 hover:text-emerald-300 border border-white/5 text-sm capitalize transition-colors"
                            >
                              {key}
                            </a>
                          ) : null,
                        )}
                      </div>

                      <div className="mt-1">
                        <h4 className="text-xs text-zinc-500 mb-2">
                          También conocido/a como
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {(actorDetails?.also_known_as || [])
                            .slice(0, 14)
                            .map((a) => (
                              <span
                                key={a}
                                className="px-2 py-0.5 rounded bg-white/5 text-xs text-zinc-400 border border-white/5"
                              >
                                {a}
                              </span>
                            ))}
                          {(actorDetails?.also_known_as || []).length > 14 && (
                            <span className="px-2 py-0.5 rounded bg-white/5 text-xs text-zinc-500 border border-white/5">
                              +{(actorDetails?.also_known_as || []).length - 14}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </AnimatedSection>
            </section>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .mask-fade-bottom {
          mask-image: linear-gradient(to bottom, black 55%, transparent 100%);
        }
      `}</style>
    </div>
  );
}
