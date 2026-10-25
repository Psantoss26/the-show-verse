"use client";

// src/app/social/TodayClient.jsx
//
// SECCIÓN SOCIAL, contenido de «Hoy»: lo más destacado de lo que ha hecho la
// gente hoy, ayer o esta semana, de las cuentas que sigues o de toda la
// comunidad. Es la tercera opción del selector Hoy / Siguiendo / Yo de la barra
// de Social (SocialClient), y esa misma barra lleva sus controles: quién, día,
// agrupar y el buscador llegan aquí como props. Inspirada en la de
// Trakt (trakt-lite, sections/today), con la misma división del trabajo: el
// backend entrega acciones planas (visto · nota · reseña) y aquí se arman las
// historias (src/lib/today/stories.js).
//
// Maqueta en tres columnas en escritorio: destacada + destacados + «Para ti» a
// la izquierda, el feed agrupado en el centro y los más activos a la derecha.
// En móvil todo va en una columna, con el carril de historias arriba.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Coffee, Loader2, Play, RefreshCw, UserPlus } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import TodayFeed from "@/components/today/TodayFeed";
import TodayPersonDrawer from "@/components/today/TodayPersonDrawer";
import TodayStoryViewer from "@/components/today/TodayStoryViewer";
import {
  ColumnHeading,
  StoryRail,
  TodayForYouRow,
  TodayHero,
  TodayHighlightCard,
  TodayMostActive,
} from "@/components/today/TodayParts";
import { hasUnseenFrames, readSeenStories, writeSeenStories } from "@/lib/today/seenStories";
import { fetchTodayFeed, peekTodayFeed, rememberTodayFeed } from "@/lib/today/todayFeedClient";
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

// Lo que busca el buscador de la barra: el título o el nombre de la persona.
function matchesQuery(action, text) {
  if (!text) return true;
  const title = (action.media?.title || "").toLowerCase();
  const name = `${action.user?.displayName || ""} ${action.user?.username || ""}`.toLowerCase();
  return title.includes(text) || name.includes(text);
}

export default function TodayClient({
  scope,
  day,
  group,
  layout = "grid",
  query = "",
  onScopeChange,
  onDayChange,
  onDaysChange,
  initialScope,
  initialDay,
  initialData,
}) {
  const { session, account, hydrated } = useAuth();

  // Una respuesta por (ámbito, día): volver a una pestaña ya vista es instantáneo.
  const [cache, setCache] = useState(() => {
    const seeded = initialData || peekTodayFeed(initialScope, initialDay);
    return seeded ? { [cacheKey(initialScope, initialDay)]: seeded } : {};
  });
  const [errors, setErrors] = useState({});
  const [seen, setSeen] = useState({});
  const [storyStart, setStoryStart] = useState(null);
  const [person, setPerson] = useState(null);
  const inFlight = useRef(new Set());

  const searchParams = useSearchParams();
  const storyParam = searchParams.get("story");

  const key = cacheKey(scope, day);
  const data = cache[key] || null;
  const error = errors[key] || "";

  useEffect(() => {
    setSeen(readSeenStories());
    // Lo visto desde otra pestaña también apaga los aros.
    const sync = () => setSeen(readSeenStories());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // Lo que llegó del RSC sirve también a la píldora «Hoy» del navbar.
  useEffect(() => {
    if (initialData) rememberTodayFeed(initialScope, initialDay, initialData);
  }, [initialData, initialScope, initialDay]);

  const load = useCallback(async (nextScope, nextDay, { force = false } = {}) => {
    const k = cacheKey(nextScope, nextDay);
    if (inFlight.current.has(k)) return;
    inFlight.current.add(k);
    try {
      const json = await fetchTodayFeed(nextScope, nextDay);
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
    if (!hydrated || !session || cache[key]) return;
    // Al volver a Hoy desde Siguiendo o Yo este componente se monta de nuevo:
    // lo pedido hace poco sale de la copia compartida sin volver a la red.
    const fresh = peekTodayFeed(scope, day);
    if (fresh) setCache((prev) => ({ ...prev, [key]: fresh }));
    else load(scope, day);
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

  // Los recuentos de las pestañas de día van al desplegable «Día» de la barra.
  useEffect(() => {
    if (data?.days) onDaysChange?.(data.days);
  }, [data, onDaysChange]);

  const tz = data?.range?.tz;
  const text = query.trim().toLowerCase();
  const derived = useMemo(() => {
    const actions = (data?.actions || []).filter((action) => matchesQuery(action, text));
    const prepared = prepareActions(actions);
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
      summary: summarize(actions),
    };
  }, [data, tz, text]);

  // En Siguiendo todos los que salen son gente que sigues; en Comunidad lo dice
  // el backend aparte (la respuesta común va cacheada).
  const followingSet = useMemo(
    () => new Set(scope === "following" ? derived.people.map((p) => p.user.id) : data?.viewerFollows || []),
    [scope, derived.people, data?.viewerFollows],
  );

  // Se escribe FUERA del actualizador de estado: writeSeenStories avisa a la
  // píldora del navbar, y hacerlo dentro sería actualizarla en mitad de este
  // render.
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const markSeen = useCallback((frameKey) => {
    if (seenRef.current[frameKey]) return;
    const next = writeSeenStories({ ...seenRef.current, [frameKey]: Date.now() });
    seenRef.current = next;
    setSeen(next);
  }, []);

  const openStory = useCallback(
    (storyKey) => {
      const index = derived.storyGroups.findIndex((g) => g.key === storyKey);
      setStoryStart(index < 0 ? 0 : index);
    },
    [derived.storyGroups],
  );

  // ?story=<título> (la píldora «Hoy» del navbar) abre el reproductor en esa
  // historia; sin clave válida, en la primera con algo sin ver. Después se quita
  // de la URL para que recargar no la vuelva a abrir.
  useEffect(() => {
    if (!storyParam || !data) return;
    const groups = derived.storyGroups;
    if (groups.length) {
      const current = readSeenStories();
      let index = groups.findIndex((g) => g.key === storyParam);
      if (index < 0) index = Math.max(0, groups.findIndex((g) => hasUnseenFrames(g, current)));
      setSeen(current);
      setStoryStart(index);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("story");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    // Solo cuando llega una clave nueva o los datos para resolverla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyParam, data]);

  const yesterdayKey = data?.days?.[1]?.key || null;
  const changeDay = (value) => onDayChange?.(value === "yesterday" ? yesterdayKey || "yesterday" : value);

  // Sin sesión lo resuelve SocialHub.
  if (!hydrated || !session || !account?.id) return null;

  const loading = !data && !error;
  const empty = data && !derived.prepared.length;
  const quiet = data && isQuietDay(data.range?.day, derived.prepared.length);
  const noFollowing = scope === "following" && data && data.following === 0;

  return (
    <div>
      <div>
        <p className="mb-4 min-h-[1.5rem] text-sm text-zinc-400" aria-live="polite">
          {loading
            ? "\u00a0"
            : derived.summary.actions
              ? `${derived.summary.actions} ${derived.summary.actions === 1 ? "actividad" : "actividades"} de ${derived.summary.people} ${derived.summary.people === 1 ? "persona" : "personas"}`
              : text
                ? "Nada coincide con la búsqueda."
                : null}
        </p>

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
              <button type="button" onClick={() => onScopeChange?.("community")} className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">
                Ver comunidad
              </button>
            </div>
          </div>
        ) : empty && text ? null : empty ? (
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
            {/* Historias en círculos solo en móvil; en escritorio, como en
                Trakt, se abren desde la destacada o desde cada cartel. */}
            <div className="lg:hidden">
              <StoryRail groups={derived.storyGroups} seen={seen} onOpen={setStoryStart} />
            </div>

            {/* Tres columnas con sus títulos alineados arriba (ColumnHeading). */}
            <div className="grid gap-x-8 gap-y-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)_300px]">
              <section aria-labelledby="today-hero" className="min-w-0">
                <ColumnHeading
                  id="today-hero"
                  action={
                    <button
                      type="button"
                      onClick={() => setStoryStart(0)}
                      className="-my-1 inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-1 text-xs font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/70"
                    >
                      Reproducir todo
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  }
                >
                  Historia destacada
                </ColumnHeading>
                <TodayHero story={derived.hero} tz={tz} onPlay={() => openStory(derived.hero?.key)} onOpenPerson={setPerson} />
                {derived.highlights.length ? (
                  <div className="mt-3 grid gap-2">
                    {derived.highlights.map((action) => (
                      <TodayHighlightCard key={action.key} action={action} tz={tz} onOpenPerson={setPerson} />
                    ))}
                  </div>
                ) : null}
                {quiet ? (
                  <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-4 text-sm text-zinc-300">
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
              </section>

              <section aria-labelledby="today-feed" className="min-w-0">
                <ColumnHeading id="today-feed" count={derived.stories.length}>
                  {scope === "community" ? "De la comunidad" : "De la gente que sigues"}
                </ColumnHeading>
                <TodayFeed
                  group={group}
                  layout={layout}
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

              {/* Más activos: tercera columna en pantallas anchas; debajo, en las medianas. */}
              <aside aria-labelledby="today-most-active" className="min-w-0 lg:col-span-2 xl:col-span-1">
                <div className="xl:sticky xl:top-40">
                  <ColumnHeading id="today-most-active">Más activos</ColumnHeading>
                  <TodayMostActive ranking={derived.ranking} onOpenPerson={setPerson} />
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
