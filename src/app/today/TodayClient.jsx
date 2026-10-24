"use client";

// src/app/today/TodayClient.jsx
//
// PÁGINA HOY: lo más destacado de lo que ha hecho la gente hoy, ayer o esta
// semana, de las cuentas que sigues o de toda la comunidad. Inspirada en la de
// Trakt (trakt-lite, sections/today), con la misma división del trabajo: el
// backend entrega acciones planas (visto · nota · reseña) y aquí se arman las
// historias (src/lib/today/stories.js).
//
// Maqueta en tres columnas en escritorio: destacada + destacados + «Para ti» a
// la izquierda, el feed agrupado en el centro y los más activos a la derecha.
// En móvil todo va en una columna, con el carril de historias arriba.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Coffee, Loader2, RefreshCw, UserPlus } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import TodayFeed, { GroupSelector } from "@/components/today/TodayFeed";
import TodayPersonDrawer from "@/components/today/TodayPersonDrawer";
import TodayStoryViewer from "@/components/today/TodayStoryViewer";
import {
  StoryRail,
  TodayForYouRow,
  TodayHero,
  TodayHighlightCard,
  TodayMasthead,
  TodayMostActive,
} from "@/components/today/TodayParts";
import { todayHref } from "@/lib/today/params";
import { readSeenStories, writeSeenStories } from "@/lib/today/seenStories";
import {
  isQuietDay,
  pickHeroStory,
  prepareActions,
  summarize,
  toFeedSections,
  toHighlights,
  toMostActive,
  toPersonGroups,
  toStoryGroups,
  toTitleStories,
} from "@/lib/today/stories";

const cacheKey = (scope, day) => `${scope}|${day}`;

export default function TodayClient({ initialScope, initialDay, initialGroup, initialData }) {
  const { session, account, hydrated } = useAuth();

  const [scope, setScope] = useState(initialScope);
  const [day, setDay] = useState(initialDay);
  const [group, setGroup] = useState(initialGroup);
  // Una respuesta por (ámbito, día): volver a una pestaña ya vista es instantáneo.
  const [cache, setCache] = useState(() =>
    initialData ? { [cacheKey(initialScope, initialDay)]: initialData } : {},
  );
  const [errors, setErrors] = useState({});
  const [seen, setSeen] = useState({});
  const [storyStart, setStoryStart] = useState(null);
  const [person, setPerson] = useState(null);
  const inFlight = useRef(new Set());

  const key = cacheKey(scope, day);
  const data = cache[key] || null;
  const error = errors[key] || "";

  useEffect(() => setSeen(readSeenStories()), []);

  // URL compartible sin volver a pedir el RSC.
  useEffect(() => {
    const href = todayHref({ scope, day, group });
    if (`${window.location.pathname}${window.location.search}` !== href) {
      window.history.replaceState(window.history.state, "", href);
    }
  }, [scope, day, group]);

  const load = useCallback(async (nextScope, nextDay, { force = false } = {}) => {
    const k = cacheKey(nextScope, nextDay);
    if (inFlight.current.has(k)) return;
    inFlight.current.add(k);
    try {
      const res = await fetch(`/api/users/today?scope=${nextScope}&day=${encodeURIComponent(nextDay)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json?.actions)) throw new Error(json?.error || `HTTP ${res.status}`);
      setCache((prev) => ({ ...prev, [k]: json }));
      setErrors((prev) => ({ ...prev, [k]: "" }));
    } catch (err) {
      // Si ya había datos se conservan: un fallo no es "no ha pasado nada".
      setErrors((prev) => ({ ...prev, [k]: force || !prev[k] ? String(err?.message || err) : prev[k] }));
    } finally {
      inFlight.current.delete(k);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !session) return;
    if (!cache[key]) load(scope, day);
    // `cache` fuera a propósito: se pide al cambiar de pestaña, no al llegar datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, session, scope, day, load]);

  // Precarga del otro ámbito en segundo plano: el primer cambio no espera.
  useEffect(() => {
    if (!hydrated || !session || !data) return;
    const other = scope === "following" ? "community" : "following";
    if (!cache[cacheKey(other, day)]) load(other, day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, session, data, scope, day]);

  const tz = data?.range?.tz;
  const derived = useMemo(() => {
    const prepared = prepareActions(data?.actions || []);
    const stories = toTitleStories(prepared);
    const hero = pickHeroStory(stories);
    const people = toPersonGroups(prepared);
    return {
      prepared,
      stories,
      hero,
      highlights: toHighlights(stories, hero),
      people,
      ranking: toMostActive(people),
      sections: toFeedSections(prepared, tz),
      storyGroups: toStoryGroups(stories, data?.forYou || []),
      summary: summarize(data?.actions || []),
    };
  }, [data, tz]);

  // En Siguiendo todos los que salen son gente que sigues; en Comunidad lo dice
  // el backend aparte (la respuesta común va cacheada).
  const followingSet = useMemo(
    () => new Set(scope === "following" ? derived.people.map((p) => p.user.id) : data?.viewerFollows || []),
    [scope, derived.people, data?.viewerFollows],
  );

  const markSeen = useCallback((frameKey) => {
    setSeen((prev) => (prev[frameKey] ? prev : writeSeenStories({ ...prev, [frameKey]: Date.now() })));
  }, []);

  const openStory = useCallback(
    (storyKey) => {
      const index = derived.storyGroups.findIndex((g) => g.key === storyKey);
      setStoryStart(index < 0 ? 0 : index);
    },
    [derived.storyGroups],
  );

  const yesterdayKey = data?.days?.[1]?.key || null;
  const changeDay = useCallback(
    (value) => setDay(value === "yesterday" ? yesterdayKey || "yesterday" : value),
    [yesterdayKey],
  );

  if (!hydrated) return <div className="min-h-screen bg-black" />;

  if (!session || !account?.id) {
    return (
      <div className="min-h-screen bg-black font-sans text-zinc-100">
        <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tighter text-white">
            Hoy<span className="text-pink-500">.</span>
          </h1>
          <p className="mt-3 text-zinc-400">Inicia sesión para ver qué está viendo la gente hoy.</p>
          <Link
            href="/login?next=/today"
            className="mt-6 inline-block rounded-2xl bg-gradient-to-br from-pink-500 to-fuchsia-600 px-6 py-3 text-sm font-bold text-white shadow-lg"
          >
            INICIAR SESIÓN
          </Link>
        </div>
      </div>
    );
  }

  const loading = !data && !error;
  const empty = data && !derived.prepared.length;
  const quiet = data && isQuietDay(data.range?.day, derived.prepared.length);
  const noFollowing = scope === "following" && data && data.following === 0;

  return (
    <div className="min-h-screen bg-black font-sans text-zinc-100 selection:bg-pink-500/30">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[5%] -top-[10%] aspect-square w-[60vw] max-w-[800px] rounded-full bg-pink-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -right-[5%] top-[15%] aspect-square w-[55vw] max-w-[700px] rounded-full bg-fuchsia-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] aspect-square w-[65vw] max-w-[800px] rounded-full bg-rose-800/20 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <TodayMasthead
          scope={scope}
          onScope={setScope}
          day={day}
          onDay={changeDay}
          days={data?.days}
          summary={derived.summary}
          loading={loading}
        />

        {error && !data ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-zinc-400">No se ha podido cargar la actividad.</p>
            <button
              type="button"
              onClick={() => load(scope, day, { force: true })}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15"
            >
              <RefreshCw className="h-4 w-4" /> Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-24" aria-label="Cargando">
            <Loader2 className="h-6 w-6 animate-spin text-pink-400" />
          </div>
        ) : noFollowing ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <UserPlus className="h-8 w-8 text-pink-400" aria-hidden="true" />
            <p className="max-w-sm text-zinc-300">Aún no sigues a nadie. Encuentra gente o mira lo que se mueve en la comunidad.</p>
            <div className="flex gap-2">
              <Link href="/members" className="rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white">
                Buscar miembros
              </Link>
              <button type="button" onClick={() => setScope("community")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">
                Ver comunidad
              </button>
            </div>
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Coffee className="h-8 w-8 text-pink-400" aria-hidden="true" />
            <p className="max-w-sm text-zinc-300">
              {data.range?.day === "today" ? "Nadie ha hecho nada todavía hoy." : "No hubo actividad ese día."}
            </p>
            {data.range?.day === "today" && yesterdayKey ? (
              <button type="button" onClick={() => changeDay("yesterday")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">
                Ver ayer
              </button>
            ) : null}
            <TodayForYouRow items={data.forYou} />
          </div>
        ) : (
          <>
            <div className="lg:hidden">
              <StoryRail groups={derived.storyGroups} seen={seen} onOpen={setStoryStart} />
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)_320px]">
              {/* Columna izquierda: lo destacado */}
              <div className="min-w-0 space-y-4">
                <div className="hidden lg:block">
                  <StoryRail groups={derived.storyGroups} seen={seen} onOpen={setStoryStart} />
                </div>
                <TodayHero story={derived.hero} onPlay={() => openStory(derived.hero?.key)} onOpenPerson={setPerson} />
                {derived.highlights.length ? (
                  <div className="hidden gap-3 sm:grid">
                    {derived.highlights.map((action) => (
                      <TodayHighlightCard key={action.key} action={action} onOpenPerson={setPerson} />
                    ))}
                  </div>
                ) : null}
                {quiet ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-4 text-sm text-zinc-300">
                    <Coffee className="h-5 w-5 shrink-0 text-pink-400" aria-hidden="true" />
                    <span className="flex-1">Ya estás al día. Hoy ha sido tranquilo.</span>
                    {yesterdayKey ? (
                      <button type="button" onClick={() => changeDay("yesterday")} className="font-bold text-pink-300 hover:text-pink-200">
                        Ver ayer
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <TodayForYouRow items={data.forYou} />
              </div>

              {/* Centro: el feed */}
              <section aria-labelledby="today-feed" className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="today-feed" className="text-sm font-bold uppercase tracking-wider text-zinc-300">
                    {scope === "community" ? "De la comunidad" : "De la gente que sigues"}
                  </h2>
                  <div className="w-[132px] sm:w-auto">
                    <GroupSelector value={group} onChange={setGroup} />
                  </div>
                </div>
                <TodayFeed
                  group={group}
                  stories={derived.stories}
                  people={derived.people}
                  sections={derived.sections}
                  tz={tz}
                  onOpenStory={openStory}
                  onOpenPerson={setPerson}
                />
                {data.truncated ? (
                  <p className="mt-4 text-center text-xs text-zinc-500">Se muestran las actividades más recientes.</p>
                ) : null}
              </section>

              {/* Derecha: más activos (debajo del feed en pantallas medianas) */}
              <aside className="min-w-0 lg:col-span-2 xl:col-span-1">
                <div className="xl:sticky xl:top-24">
                  <TodayMostActive
                    ranking={derived.ranking}
                    scope={scope}
                    viewerId={account.id}
                    followingSet={followingSet}
                    onOpenPerson={setPerson}
                  />
                </div>
              </aside>
            </div>
          </>
        )}
      </div>

      <TodayStoryViewer
        groups={derived.storyGroups}
        startIndex={storyStart}
        seen={seen}
        onSeen={markSeen}
        onClose={() => setStoryStart(null)}
      />
      <TodayPersonDrawer
        person={person}
        actions={derived.prepared}
        following={person ? followingSet.has(person.id) : false}
        viewerId={account.id}
        onClose={() => setPerson(null)}
      />
    </div>
  );
}
