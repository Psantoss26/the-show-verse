"use client";

// /src/components/userLists/AdvancedFilters.jsx
// Filtros avanzados de las páginas de usuario (lógica en
// lib/userLists/advancedFilters.js).
//   - `AdvancedFilterGroups`: los grupos (barras de nota y año, géneros,
//     plataformas, visto…), dentro de `AdvancedFiltersPanel`: una hoja propia,
//     de lado desde 640px e inferior en móvil (placement="side").
//   - `AdvancedFiltersButton`: el botón de la barra de escritorio, con el
//     número de filtros activos.
//   - `AdvancedFiltersSheetButton`: el de móvil, en la cabecera de la hoja de
//     filtros de la página.

import { startTransition, useEffect, useState, useSyncExternalStore } from "react";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock,
  Eye,
  History,
  Languages,
  ListChecks,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Star,
  SunMoon,
  Tag,
  Timer,
  Tv,
  Users,
} from "lucide-react";
import {
  ControlledOptionsSheet,
  SheetAction,
  SheetOption,
  SheetOptionGroup,
  useOptionsSheetOpen,
} from "@/components/ui/MobileOptionsSheet";
import {
  ADVANCED_PROVIDER_OPTIONS,
  DAY_PART_OPTIONS,
  LAST_WATCHED_OPTIONS,
  MIN_VOTES_OPTIONS,
  NO_PROVIDER_KEY,
  RATING_MAX,
  RATING_MIN,
  RELEASE_OPTIONS,
  REMAINING_OPTIONS,
  RUNTIME_MAX,
  RUNTIME_OPTIONS,
  SERIES_STATUS_OPTIONS,
  VOTE_STEPS,
  WATCHED_OPTIONS,
  WEEKDAY_OPTIONS,
  createDefaultAdvancedFilters,
  formatRuntimeMinutes,
  formatVotes,
  isRuntimeRangeActive,
} from "@/lib/userLists/advancedFilters";

// Color de la barra y del tirador (el acento de la página).
const ACCENT_HEX = {
  red: "#ef4444",
  blue: "#3b82f6",
  emerald: "#10b981",
  amber: "#f59e0b",
  orange: "#f97316",
  purple: "#a855f7",
};

const PROVIDER_LOGOS = {
  netflix: "https://image.tmdb.org/t/p/w92/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg",
  prime: "https://image.tmdb.org/t/p/w92/pvske1MyAoymrs5bguRfVqYiM9a.jpg",
  "hbo-max": "https://image.tmdb.org/t/p/w92/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
  crunchyroll: "https://image.tmdb.org/t/p/w92/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg",
  movistar: "https://image.tmdb.org/t/p/w92/jse4MOi92Jgetym7nbXFZZBI6LK.jpg",
  disney: "https://image.tmdb.org/t/p/w92/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg",
  plex: "/logo-Plex.png",
};

const formatRating = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

// Pista común de RangeBar y StepBar (diseño «cápsula»): surco ancho hundido,
// relleno en degradado del color de la página entre `from` y `to` (en %) y la
// escala debajo. Sin filtro el relleno es neutro. Mientras se arrastra o se
// enfoca un tirador, una burbuja del color de la página sigue su valor.
// Pista y relleno se recortan medio tirador a cada lado (--sv-range-thumb,
// globals.css) para que el centro del tirador caiga justo en su valor.
// Los <input> llevan `.sv-range-input`: solo su tirador recibe el puntero
// (pointer-events), así dos inputs superpuestos se arrastran cada uno el suyo.
const THUMB_HALF = "calc(var(--sv-range-thumb) / 2)";
const atPercent = (percent) =>
  `calc(${THUMB_HALF} + (100% - var(--sv-range-thumb)) * ${percent / 100})`;

function RangeTrack({ from, to, active, minLabel, maxLabel, bubble = null, children }) {
  return (
    <div className="sv-range">
      <div className="relative h-11 w-full">
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-white/[0.06] shadow-[inset_0_1px_3px_rgb(0_0_0/0.65),0_1px_0_rgb(255_255_255/0.05)]"
          style={{ left: THUMB_HALF, right: THUMB_HALF }}
        />
        <div
          className={`sv-range-fill absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full ${active ? "sv-range-fill-on" : ""}`}
          style={{ left: atPercent(from), width: `calc((100% - var(--sv-range-thumb)) * ${(to - from) / 100})` }}
        />
        {children}
        {bubble ? (
          <div
            className="sv-range-bubble pointer-events-none absolute -top-5 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black tabular-nums leading-none"
            style={{ left: atPercent(bubble.percent) }}
            aria-hidden="true"
          >
            {bubble.label}
          </div>
        ) : null}
      </div>
      <div className="-mt-1 flex justify-between px-0.5 text-[11px] font-bold tabular-nums text-zinc-500">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

// Cabecera de una barra: qué ajusta y, a la derecha, el valor elegido en una
// píldora (con el color de la página si el filtro está puesto).
function RangeHeader({ label, valueLabel, active }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-bold text-zinc-200">{label}</span>
      <span className={`sv-range-value inline-flex min-h-6 items-center rounded-full px-2.5 pt-px text-xs font-bold tabular-nums ${active ? "sv-range-value-on" : ""}`}>
        {valueLabel}
      </span>
    </div>
  );
}

const RANGE_INPUT_CLASS =
  "sv-range-input pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent";

// Qué tirador se está moviendo (para la burbuja): al pulsarlo o enfocarlo
// con el teclado; se suelta al levantar el dedo o perder el foco.
function useActiveThumb() {
  const [activeThumb, setActiveThumb] = useState(null);
  const bind = (index, commit) => ({
    onPointerDown: () => setActiveThumb(index),
    onFocus: () => setActiveThumb(index),
    onPointerUp: () => {
      setActiveThumb(null);
      commit();
    },
    onPointerCancel: () => {
      setActiveThumb(null);
      commit();
    },
    onKeyUp: commit,
    onBlur: () => {
      setActiveThumb(null);
      commit();
    },
  });
  return [activeThumb, bind];
}

// Barra de dos tiradores. Mientras se arrastra solo cambia el estado local; el
// filtro se aplica al soltar, para no recalcular la lista en cada paso.
function RangeBar({ label, min, max, step = 1, value, onChange, format = (v) => v }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const [activeThumb, bind] = useActiveThumb();

  const [lo, hi] = [Math.min(...draft), Math.max(...draft)];
  const span = max - min || 1;
  const toPercent = (v) => ((v - min) / span) * 100;
  const full = lo === min && hi === max;
  const commit = () => {
    if (lo !== value[0] || hi !== value[1]) onChange([lo, hi]);
  };

  return (
    <div>
      <RangeHeader
        label={label}
        valueLabel={full ? "Cualquiera" : lo === hi ? format(lo) : `${format(lo)} – ${format(hi)}`}
        active={!full}
      />
      <RangeTrack
        from={toPercent(lo)}
        to={toPercent(hi)}
        active={!full}
        minLabel={format(min)}
        maxLabel={format(max)}
        bubble={
          activeThumb == null
            ? null
            : { percent: toPercent(draft[activeThumb]), label: format(draft[activeThumb]) }
        }
      >
        {[0, 1].map((index) => (
          <input
            key={index}
            type="range"
            min={min}
            max={max}
            step={step}
            value={draft[index]}
            aria-label={`${label} ${index === 0 ? "mínimo" : "máximo"}`}
            aria-valuetext={String(format(draft[index]))}
            onChange={(event) => {
              const next = [...draft];
              next[index] = Number(event.target.value);
              setDraft(next);
            }}
            {...bind(index, commit)}
            className={RANGE_INPUT_CLASS}
          />
        ))}
      </RangeTrack>
    </div>
  );
}

// Barra de un tirador sobre una escala de escalones (mínimo de votos): el
// tirador recorre los índices y la etiqueta enseña el valor del escalón.
function StepBar({ label, steps, value, onChange, format = (v) => v, anyLabel = "Cualquiera" }) {
  const index = Math.max(0, steps.findIndex((step) => step >= value));
  const [draft, setDraft] = useState(index);
  useEffect(() => setDraft(index), [index]);
  const [activeThumb, bind] = useActiveThumb();
  const commit = () => {
    if (steps[draft] !== value) onChange(steps[draft]);
  };
  const percent = (draft / (steps.length - 1 || 1)) * 100;
  const valueLabel = draft === 0 ? anyLabel : format(steps[draft]);

  return (
    <div>
      <RangeHeader label={label} valueLabel={valueLabel} active={draft !== 0} />
      <RangeTrack
        from={percent}
        to={100}
        active={draft !== 0}
        minLabel={anyLabel}
        maxLabel={format(steps[steps.length - 1])}
        bubble={activeThumb == null ? null : { percent, label: valueLabel }}
      >
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={draft}
          aria-label={label}
          aria-valuetext={valueLabel}
          onChange={(event) => setDraft(Number(event.target.value))}
          {...bind(0, commit)}
          className={RANGE_INPUT_CLASS}
        />
      </RangeTrack>
    </div>
  );
}

// Esqueleto del panel ENTERO mientras llegan las fichas de los títulos
// (idiomas, géneros…): al tenerlas se pintan todas las secciones a la vez, en
// vez de ir apareciendo grupos y botones con el panel ya abierto. Un solo
// `animate-pulse` para todo el bloque.
const SKELETON_GROUPS = [
  [96, 88, 92, 112],
  [72, 84, 70, 120, 150, 88, 76, 110, 80, 96],
  null,
  [76, 82, 90],
  [116, 96, 92, 84],
  null,
  [92, 104, 92, 110, 100],
];

function AdvancedFiltersSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Cargando filtros">
      {SKELETON_GROUPS.map((pills, groupIndex) => (
        <div key={groupIndex}>
          <div className="mb-2 h-3 w-28 rounded-full bg-white/10" />
          {pills ? (
            <div className="flex flex-wrap gap-2">
              {pills.map((width, index) => (
                <div key={index} className="h-9 rounded-full bg-white/[0.07]" style={{ width }} />
              ))}
            </div>
          ) : (
            <div className="pt-1">
              <div className="mb-3 flex justify-between">
                <div className="h-3.5 w-20 rounded-full bg-white/10" />
                <div className="h-6 w-20 rounded-full bg-white/[0.07]" />
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.07]" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Orden del panel: primero lo que se elige con botones (qué es, de qué
// género, dónde se ve, cuándo lo viste…), con las barras de año, duración,
// progreso y votos repartidas entre ellos, cada una en su grupo; las de
// puntuación, todas juntas al final.
export function AdvancedFilterGroups({
  filters,
  onChange,
  accent = "red",
  yearBounds = null,
  genreOptions = [],
  languageOptions = [],
  // Qué grupos tienen sentido en la página.
  showUserRating = true,
  showWatched = true,
  showTrakt = false,
  showRuntime = true,
  showSeriesStatus = true,
  showVotes = true,
  showLastWatched = false,
  showRelease = false,
  showProgress = false,
  showRemaining = false,
  showWatchTime = false,
  loadingProviders = false,
  // Duración y estado esperan a la ficha de cada título.
  loadingTitleMeta = false,
  // Fichas de los títulos ya recibidas: hasta entonces, esqueleto del panel.
  optionsReady = true,
  showReset = false,
}) {
  if (!optionsReady) return <AdvancedFiltersSkeleton />;
  const update = (patch) => onChange({ ...filters, ...patch });
  const toggle = (field, value) => {
    const list = filters[field] || [];
    update({ [field]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };
  const yearValue = yearBounds
    ? [
        Math.max(yearBounds[0], filters.yearRange?.[0] ?? yearBounds[0]),
        Math.min(yearBounds[1], filters.yearRange?.[1] ?? yearBounds[1]),
      ]
    : null;
  const sameRange = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
  const loadingLabel = (label, active) => (loadingTitleMeta && active ? `${label} · cargando…` : label);

  return (
    <div className="space-y-5" style={{ "--sv-range-accent": ACCENT_HEX[accent] || ACCENT_HEX.red }}>
      {showSeriesStatus ? (
        <SheetOptionGroup
          label={loadingLabel("Estado de la serie", filters.seriesStatus.length > 0)}
          icon={Radio}
        >
          {SERIES_STATUS_OPTIONS.map((option) => (
            <SheetOption
              key={option.key}
              active={filters.seriesStatus.includes(option.key)}
              onClick={() => toggle("seriesStatus", option.key)}
            >
              {option.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {genreOptions.length ? (
        <SheetOptionGroup label="Géneros" icon={Tag}>
          {genreOptions.map((genre) => (
            <SheetOption
              key={genre.id}
              active={filters.genres.includes(genre.id)}
              count={genre.count}
              onClick={() => toggle("genres", genre.id)}
            >
              {genre.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {yearBounds && yearBounds[0] < yearBounds[1] ? (
        <SheetOptionGroup label="Año" icon={CalendarRange} layout="stack">
          <RangeBar
            label="Estreno"
            min={yearBounds[0]}
            max={yearBounds[1]}
            value={yearValue}
            onChange={(yearRange) =>
              update({
                yearRange:
                  yearRange[0] <= yearBounds[0] && yearRange[1] >= yearBounds[1] ? null : yearRange,
              })
            }
          />
        </SheetOptionGroup>
      ) : null}

      {languageOptions.length > 1 ? (
        <SheetOptionGroup label="Idioma original" icon={Languages}>
          {languageOptions.map((language) => (
            <SheetOption
              key={language.id}
              active={filters.originalLanguages.includes(language.id)}
              count={language.count}
              onClick={() => toggle("originalLanguages", language.id)}
            >
              {language.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {showRuntime ? (
        <SheetOptionGroup
          label={loadingLabel("Duración", isRuntimeRangeActive(filters.runtimeRange))}
          icon={Timer}
          layout="stack"
        >
          <div className="flex flex-wrap gap-2">
            {RUNTIME_OPTIONS.map((option) => {
              const active = sameRange(filters.runtimeRange, option.range);
              return (
                <SheetOption
                  key={option.key}
                  active={active}
                  onClick={() =>
                    update({ runtimeRange: active ? [0, RUNTIME_MAX] : [...option.range] })
                  }
                >
                  {option.label}
                </SheetOption>
              );
            })}
          </div>
          <RangeBar
            label="De la película o del episodio"
            min={0}
            max={RUNTIME_MAX}
            step={5}
            value={filters.runtimeRange}
            format={formatRuntimeMinutes}
            onChange={(runtimeRange) => update({ runtimeRange })}
          />
        </SheetOptionGroup>
      ) : null}

      <SheetOptionGroup label={loadingProviders ? "Disponibilidad · cargando…" : "Disponibilidad"} icon={Tv}>
        {ADVANCED_PROVIDER_OPTIONS.map((provider) => (
          <SheetOption
            key={provider.key}
            active={filters.providers.includes(provider.key)}
            onClick={() => toggle("providers", provider.key)}
            media={
              <img
                src={PROVIDER_LOGOS[provider.key]}
                alt=""
                loading="eager"
                decoding="sync"
                className="block h-5 w-5 rounded-md object-cover"
              />
            }
          >
            {provider.label}
          </SheetOption>
        ))}
        <SheetOption
          active={filters.providers.includes(NO_PROVIDER_KEY)}
          onClick={() => toggle("providers", NO_PROVIDER_KEY)}
        >
          Sin plataforma
        </SheetOption>
      </SheetOptionGroup>

      {showWatched ? (
        <SheetOptionGroup label="Visto" icon={Eye}>
          {WATCHED_OPTIONS.map((option) => (
            <SheetOption
              key={option.key}
              active={filters.watched === option.key}
              onClick={() => update({ watched: option.key })}
            >
              {option.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {showRelease ? (
        <SheetOptionGroup label="Estreno" icon={CalendarClock}>
          {RELEASE_OPTIONS.map((option) => (
            <SheetOption
              key={option.key}
              active={filters.release === option.key}
              onClick={() => update({ release: option.key })}
            >
              {option.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {showLastWatched ? (
        <SheetOptionGroup label="Visto por última vez" icon={History}>
          {LAST_WATCHED_OPTIONS.map((option) => (
            <SheetOption
              key={option.key}
              active={filters.lastWatched === option.key}
              onClick={() => update({ lastWatched: option.key })}
            >
              {option.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {showRemaining ? (
        <SheetOptionGroup label="Episodios que faltan" icon={Clock}>
          {REMAINING_OPTIONS.map((option) => (
            <SheetOption
              key={option.key}
              active={filters.remaining.includes(option.key)}
              onClick={() => toggle("remaining", option.key)}
            >
              {option.label}
            </SheetOption>
          ))}
        </SheetOptionGroup>
      ) : null}

      {showProgress ? (
        <SheetOptionGroup label="Progreso" icon={ListChecks} layout="stack">
          <RangeBar
            label="Episodios vistos"
            min={0}
            max={100}
            step={5}
            value={filters.progress}
            format={(value) => `${value} %`}
            onChange={(progress) => update({ progress })}
          />
        </SheetOptionGroup>
      ) : null}

      {showWatchTime ? (
        <>
          <SheetOptionGroup label="Día de la semana" icon={CalendarDays}>
            {WEEKDAY_OPTIONS.map((option) => (
              <SheetOption
                key={option.key}
                active={filters.weekdays.includes(option.key)}
                onClick={() => toggle("weekdays", option.key)}
              >
                {option.label}
              </SheetOption>
            ))}
          </SheetOptionGroup>
          <SheetOptionGroup label="Franja horaria" icon={SunMoon}>
            {DAY_PART_OPTIONS.map((option) => (
              <SheetOption
                key={option.key}
                active={filters.dayParts.includes(option.key)}
                onClick={() => toggle("dayParts", option.key)}
              >
                {option.label}
              </SheetOption>
            ))}
          </SheetOptionGroup>
        </>
      ) : null}

      {showVotes ? (
        <SheetOptionGroup label="Votos en TMDb" icon={Users} layout="stack">
          <div className="flex flex-wrap gap-2">
            {MIN_VOTES_OPTIONS.map((option) => (
              <SheetOption
                key={option.value}
                active={filters.minVotes === option.value}
                onClick={() => update({ minVotes: option.value })}
              >
                {option.label}
              </SheetOption>
            ))}
          </div>
          <StepBar
            label="Mínimo"
            steps={VOTE_STEPS}
            value={filters.minVotes}
            format={(value) => `${formatVotes(value)}+`}
            onChange={(minVotes) => update({ minVotes })}
          />
        </SheetOptionGroup>
      ) : null}

      <SheetOptionGroup label="Puntuación" icon={Star} layout="stack">
        {showUserRating ? (
          <RangeBar
            label="Mi nota"
            min={RATING_MIN}
            max={RATING_MAX}
            value={filters.userRating}
            onChange={(userRating) => update({ userRating })}
          />
        ) : null}
        <RangeBar
          label="IMDb"
          min={RATING_MIN}
          max={RATING_MAX}
          step={0.5}
          value={filters.imdbRating}
          format={formatRating}
          onChange={(imdbRating) => update({ imdbRating })}
        />
        <RangeBar
          label="TMDb"
          min={RATING_MIN}
          max={RATING_MAX}
          step={0.5}
          value={filters.tmdbRating}
          format={formatRating}
          onChange={(tmdbRating) => update({ tmdbRating })}
        />
        {showTrakt ? (
          <RangeBar
            label="Trakt"
            min={RATING_MIN}
            max={RATING_MAX}
            step={0.5}
            value={filters.traktRating}
            format={formatRating}
            onChange={(traktRating) => update({ traktRating })}
          />
        ) : null}
      </SheetOptionGroup>

      {showReset ? (
        <SheetAction icon={RotateCcw} onClick={() => onChange(createDefaultAdvancedFilters())}>
          Restablecer filtros avanzados
        </SheetAction>
      ) : null}
    </div>
  );
}

export function AdvancedFiltersBadge({ count, accent = "red" }) {
  if (!count) return null;
  return (
    <span
      className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 pt-px text-[11px] font-black leading-none text-black tabular-nums"
      style={{ background: ACCENT_HEX[accent] || ACCENT_HEX.red }}
    >
      {count}
    </span>
  );
}

// La página pide los datos de los filtros avanzados (fichas, notas…) antes de
// enseñarlos: al pasar el puntero o enfocar el botón de escritorio, o un poco
// después de abrir la hoja de filtros de la página (móvil, donde está el botón
// «Avanzados») o la propia hoja de avanzados. Nunca en el fotograma en que una
// hoja empieza a subir: se entera al terminar la animación, y solo una vez.
const ADVANCED_DATA_DELAY_MS = 380;
const intentStores = new WeakMap();

function getIntentStore(controller) {
  let store = intentStores.get(controller);
  if (!store) {
    let requested = false;
    const listeners = new Set();
    store = {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => requested,
      request() {
        if (requested) return;
        requested = true;
        listeners.forEach((listener) => listener());
      },
    };
    intentStores.set(controller, store);
  }
  return store;
}

const getFalse = () => false;

function prefetchAdvancedFilters(controller) {
  if (controller) startTransition(() => getIntentStore(controller).request());
}

export function useAdvancedFiltersRequested(controller, pageSheetController = null) {
  const open = useOptionsSheetOpen(controller);
  const pageSheetOpen = useOptionsSheetOpen(pageSheetController);
  const store = getIntentStore(controller);
  const intent = useSyncExternalStore(store.subscribe, store.getSnapshot, getFalse);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (requested) return undefined;
    if (intent) {
      startTransition(() => setRequested(true));
      return undefined;
    }
    if (!open && !pageSheetOpen) return undefined;
    const timer = window.setTimeout(
      () => startTransition(() => setRequested(true)),
      ADVANCED_DATA_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [open, pageSheetOpen, intent, requested]);
  return requested;
}

export function AdvancedFiltersButton({ controller, count = 0, accent = "red" }) {
  const open = useOptionsSheetOpen(controller);
  return (
    <button
      type="button"
      onClick={controller.open}
      onPointerEnter={() => prefetchAdvancedFilters(controller)}
      onFocus={() => prefetchAdvancedFilters(controller)}
      aria-haspopup="dialog"
      aria-expanded={open ? "true" : "false"}
      className="sv-page-toolbar-trigger inline-flex h-11 min-w-0 shrink-0 items-center gap-2 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm text-zinc-200 shadow-lg backdrop-blur-lg transition hover:from-white/15 hover:to-white/10"
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0" style={{ color: ACCENT_HEX[accent] || ACCENT_HEX.red }} />
      <span className="sv-page-toolbar-value whitespace-nowrap font-bold text-white">Filtros</span>
      <AdvancedFiltersBadge count={count} accent={accent} />
    </button>
  );
}

// Móvil: botón de la cabecera de la hoja de filtros de la página, que abre
// los filtros avanzados en su propia hoja (AdvancedFiltersPanel).
export function AdvancedFiltersSheetButton({ onClick, count = 0, accent = "red" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="flex h-10 items-center gap-1.5 rounded-full bg-white/5 pl-3 pr-3.5 text-[13px] font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0" style={{ color: ACCENT_HEX[accent] || ACCENT_HEX.red }} aria-hidden="true" />
      Avanzados
      <AdvancedFiltersBadge count={count} accent={accent} />
    </button>
  );
}

// Hoja de los filtros avanzados: de lado en escritorio (desde 640px) e
// inferior en móvil, con los grupos y un pie para restablecer / cerrar.
export function AdvancedFiltersPanel({
  controller,
  accent = "red",
  activeFilters = [],
  resultCount = null,
  filters,
  onChange,
  ...groupProps
}) {
  const accentHex = ACCENT_HEX[accent] || ACCENT_HEX.red;
  return (
    <ControlledOptionsSheet
      controller={controller}
      title="Filtros avanzados"
      subtitle={
        activeFilters.length
          ? activeFilters.map((filter) => filter.label).join(" · ")
          : "Sin filtros"
      }
      accent={accent}
      placement="side"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange(createDefaultAdvancedFilters())}
            disabled={!activeFilters.length}
            className="flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 px-4 text-sm font-bold text-zinc-200 shadow-lg transition hover:from-white/15 hover:to-white/10 disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" style={{ color: accentHex }} />
            Restablecer
          </button>
          <button
            type="button"
            onClick={controller.close}
            className="flex min-h-11 flex-1 items-center justify-center rounded-2xl px-4 text-sm font-black text-white shadow-lg transition hover:brightness-110"
            style={{ background: accentHex }}
          >
            {resultCount == null
              ? "Ver resultados"
              : `Ver ${resultCount.toLocaleString("es-ES")} ${resultCount === 1 ? "título" : "títulos"}`}
          </button>
        </div>
      }
    >
      <AdvancedFilterGroups filters={filters} onChange={onChange} accent={accent} {...groupProps} />
    </ControlledOptionsSheet>
  );
}
