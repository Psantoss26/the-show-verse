"use client";

// /src/components/userLists/AdvancedFilters.jsx
// Filtros avanzados de las páginas de usuario (lógica en
// lib/userLists/advancedFilters.js).
//   - `AdvancedFilterGroups`: los grupos (barras de nota y año, géneros,
//     plataformas, visto). Se pintan dentro de cualquier MobileOptionsSheet:
//     en móvil amplían la hoja de filtros de la página; en escritorio van en
//     `AdvancedFiltersPanel`, la misma hoja de lado (placement="side").
//   - `AdvancedFiltersButton`: el botón de la barra de escritorio, con el
//     número de filtros activos.

import { useEffect, useState } from "react";
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
import MobileOptionsSheet, { SheetAction, SheetOption, SheetOptionGroup } from "@/components/ui/MobileOptionsSheet";
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

// Barra de dos tiradores. Mientras se arrastra solo cambia el estado local; el
// filtro se aplica al soltar, para no recalcular la lista en cada paso.
function RangeBar({ label, min, max, step = 1, value, onChange, format = (v) => v }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const [lo, hi] = [Math.min(...draft), Math.max(...draft)];
  const span = max - min || 1;
  const from = ((lo - min) / span) * 100;
  const to = ((hi - min) / span) * 100;
  const commit = () => {
    if (lo !== value[0] || hi !== value[1]) onChange([lo, hi]);
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-bold text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-[color:var(--sv-range-accent)]">
          {lo === min && hi === max ? "Cualquiera" : `${format(lo)} – ${format(hi)}`}
        </span>
      </div>
      <div className="relative h-8 w-full">
        <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[color:var(--sv-range-accent)]"
          style={{
            left: `calc(8px + (100% - 16px) * ${from / 100})`,
            width: `calc((100% - 16px) * ${(to - from) / 100})`,
          }}
        />
        {[0, 1].map((index) => (
          <input
            key={index}
            type="range"
            min={min}
            max={max}
            step={step}
            value={draft[index]}
            aria-label={`${label} ${index === 0 ? "mínimo" : "máximo"}`}
            onChange={(event) => {
              const next = [...draft];
              next[index] = Number(event.target.value);
              setDraft(next);
            }}
            onPointerUp={commit}
            onKeyUp={commit}
            onBlur={commit}
            className="sv-range-thumb pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent"
          />
        ))}
      </div>
    </div>
  );
}

// Barra de un tirador sobre una escala de escalones (mínimo de votos): el
// tirador recorre los índices y la etiqueta enseña el valor del escalón.
function StepBar({ label, steps, value, onChange, format = (v) => v, anyLabel = "Cualquiera" }) {
  const index = Math.max(0, steps.findIndex((step) => step >= value));
  const [draft, setDraft] = useState(index);
  useEffect(() => setDraft(index), [index]);
  const commit = () => {
    if (steps[draft] !== value) onChange(steps[draft]);
  };
  const percent = (draft / (steps.length - 1 || 1)) * 100;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs font-bold text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums text-[color:var(--sv-range-accent)]">
          {draft === 0 ? anyLabel : format(steps[draft])}
        </span>
      </div>
      <div className="relative h-8 w-full">
        <div className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-[color:var(--sv-range-accent)]"
          style={{
            left: `calc(8px + (100% - 16px) * ${percent / 100})`,
            right: "8px",
          }}
        />
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={draft}
          aria-label={label}
          aria-valuetext={draft === 0 ? anyLabel : format(steps[draft])}
          onChange={(event) => setDraft(Number(event.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="sv-range-thumb pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent"
        />
      </div>
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
  showReset = false,
}) {
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
                loading="lazy"
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

export function AdvancedFiltersButton({ open, onClick, count = 0, accent = "red" }) {
  return (
    <button
      type="button"
      onClick={onClick}
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

// Escritorio: hoja de lado con los grupos y un pie para restablecer / cerrar.
export function AdvancedFiltersPanel({
  open,
  onClose,
  accent = "red",
  activeFilters = [],
  resultCount = null,
  filters,
  onChange,
  ...groupProps
}) {
  const accentHex = ACCENT_HEX[accent] || ACCENT_HEX.red;
  return (
    <MobileOptionsSheet
      open={open}
      onClose={onClose}
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
            onClick={onClose}
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
    </MobileOptionsSheet>
  );
}
