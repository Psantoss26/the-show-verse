"use client";

// Editor del ajuste «Puntuaciones en el móvil» (Ajustes → Preferencias).
// Enseña la ficha móvil de un título de ejemplo con el MARCADOR REAL
// (DetailsScoreboardPanel en disposición de teléfono) y, sueltas alrededor, las
// puntuaciones que no están en él. Se arrastran sobre el marcador para
// añadirlas (en un hueco) o sustituir una (encima de ella); las del marcador se
// arrastran para reordenarlas o, sacándolas fuera, quitarlas. Película y serie
// tienen cada una su lista (Letterboxd solo existe en películas).
//
// Mismo esquema de arrastre que el editor de la barra inferior móvil
// (MobileBottomNavEditor en ProfileSettingsClient): eventos de puntero con
// captura, destino por `elementFromPoint` y una ficha fantasma en un portal.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftRight,
  AudioLines,
  Check,
  Bookmark,
  BookmarkPlus,
  Clapperboard,
  Eye,
  EyeOff,
  Gauge,
  Heart,
  ListPlus,
  ListVideo,
  MessageSquare,
  Play,
  Plus,
  Star,
  Tv,
  RotateCcw,
  UsersRound,
  X,
} from "lucide-react";

import DetailsScoreboardPanel from "@/components/details/DetailsScoreboardPanel";
import MobileOptionsSheet, { SheetOption, SheetOptionGroup } from "@/components/ui/MobileOptionsSheet";
import SettingsGlassModal, { SETTINGS_MODAL_ICON_BUTTON } from "@/components/settings/SettingsGlassModal";
import {
  DEFAULT_PHONE_SCORES,
  PHONE_SCORES_MAX,
  PHONE_SCORE_OPTIONS,
  phoneScoreOptionsFor,
  placePhoneScore,
  removePhoneScore,
  replacePhoneScore,
  sanitizePhoneScores,
} from "@/lib/ui/phoneScoreboardScores";

// Cifras de ejemplo (ya formateadas, como las pasa la ficha).
const SAMPLE_SCORES = {
  tmdb: { value: "8.4", sub: "12K" },
  trakt: { value: "8.6", sub: "48K" },
  imdb: { value: "8.5", sub: "2.1M" },
  rt: { value: "9.1", sub: "250K+" },
  mc: { value: "8.9", sub: "3.4K" },
  lb: { value: "8.8", sub: "1.2M" },
};

const SCATTER = [
  "-rotate-3 -translate-y-1",
  "rotate-2 translate-y-1",
  "-rotate-1 translate-y-2",
  "rotate-3 -translate-y-2",
  "-rotate-2 translate-y-1",
];

const optionFor = (key) => PHONE_SCORE_OPTIONS.find((option) => option.key === key);

function ScoreChip({ option, index, dragging, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, label }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      aria-label={label}
      className={`touch-none flex min-h-11 items-center gap-2 rounded-full bg-zinc-900/90 px-3 py-2 text-xs font-bold text-zinc-200 shadow-lg shadow-black/20 transition-[transform,background-color,opacity] duration-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${SCATTER[index % SCATTER.length]} ${dragging ? "scale-110 bg-emerald-500/20 opacity-70 shadow-[0_0_20px_rgba(110,231,183,0.35)]" : "active:scale-95"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={option.logo} alt="" className="h-5 w-auto max-w-[2.2rem] object-contain" draggable={false} />
      <span className="whitespace-nowrap">{option.label}</span>
    </button>
  );
}

// Sin botón de guardar: lo elegido se guarda al cerrar (X, Escape o fuera del
// panel), solo si cambió algo.
export default function PhoneScoresEditor({ isOpen, onClose, value, onSave, t }) {
  const [draft, setDraft] = useState(() => sanitizePhoneScores(value));
  const [mediaType, setMediaType] = useState("movie");
  const [drag, setDrag] = useState(null); // { key, fromBoard, x, y, targetKey, onBoard, addIndex }
  // Selector de puntuación: { key, mode } para cambiar/quitar esa (`mode`:
  // "modal" en escritorio, "sheet" —hoja inferior— en el móvil), { key: null }
  // para añadir (hoja, solo móvil).
  const [picker, setPicker] = useState(null);
  // La última tocada: el modal y la hoja la siguen enseñando mientras se van.
  const [pickedKey, setPickedKey] = useState(null);
  const sessionRef = useRef(null);
  const suppressClickRef = useRef(false);
  const boardRef = useRef(null);
  // Arrastre desde las sueltas: geometría del marcador al empezar (sin hueco
  // «+»). El destino se decide con ella y no con lo que hay bajo el puntero:
  // el hueco recoloca las insignias, y decidir sobre el marcador ya movido
  // haría saltar entre «añadir» y «sustituir» sin mover el puntero.
  const paletteSnapRef = useRef(null);
  // FLIP de las insignias: posición en pantalla antes del cambio.
  const flipFromRef = useRef(null);

  // `value` llega como objeto nuevo en cada render del padre: se compara por
  // contenido para no rehacer el borrador cada vez que el padre se repinta.
  const valueKey = JSON.stringify(sanitizePhoneScores(value));
  useEffect(() => {
    if (isOpen) setDraft(JSON.parse(valueKey));
  }, [isOpen, valueKey]);

  const closeAndSave = () => {
    const next = sanitizePhoneScores(draft);
    if (JSON.stringify(next) !== valueKey) onSave(next);
    onClose();
  };

  // Escape cierra antes el selector de puntuación, si lo hay.
  const onEscape = () => {
    if (picker) setPicker(null);
    else closeAndSave();
  };

  const list = draft[mediaType];
  const available = phoneScoreOptionsFor(mediaType).filter((option) => !list.includes(option.key));
  const setList = (updater) =>
    setDraft((current) => ({ ...current, [mediaType]: updater(current[mediaType]) }));

  // Destino bajo el puntero: una puntuación del marcador (`key`), un hueco del
  // marcador (`onBoard` sin `key`, con la posición por la X) o fuera.
  const dropTargetAt = (x, y, draggedKey) => {
    const element = document.elementFromPoint(x, y);
    const board = element?.closest("[data-phone-board]");
    if (!board) return { key: null, onBoard: false, index: null };
    const scoreEl = element.closest("[data-phone-score]");
    const key = scoreEl?.dataset.phoneScore || null;
    const centers = [...board.querySelectorAll("[data-phone-score]")]
      .filter((el) => el.dataset.phoneScore !== draggedKey)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return rect.left + rect.width / 2;
      });
    return { key, onBoard: true, index: centers.filter((center) => center < x).length };
  };

  const boardItems = () =>
    boardRef.current ? [...boardRef.current.querySelectorAll("[data-phone-score],[data-phone-add-slot]")] : [];

  // Antes de un cambio que recoloca el marcador: guarda dónde se ve cada
  // insignia ahora (con la animación en curso, si la hay).
  const captureBoardFlip = () => {
    const from = new Map();
    for (const el of boardItems()) from.set(el.dataset.phoneScore || "+", el.getBoundingClientRect().left);
    flipFromRef.current = from;
  };

  // Tras el cambio: cada insignia se desliza desde donde estaba; el hueco «+»
  // nuevo crece en su sitio. El teléfono va reducido con `scale`: el
  // desplazamiento en pantalla se pasa a píxeles del marcador.
  useLayoutEffect(() => {
    const from = flipFromRef.current;
    flipFromRef.current = null;
    const board = boardRef.current;
    if (!from || !board) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const scale = board.getBoundingClientRect().width / (board.offsetWidth || 1) || 1;
    for (const el of boardItems()) {
      for (const animation of el.getAnimations()) if (animation.id === "phone-flip") animation.cancel();
      if (reduce) continue;
      const key = el.dataset.phoneScore || "+";
      const options = { id: "phone-flip", duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
      if (!from.has(key)) {
        el.animate([{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }], options);
        continue;
      }
      const dx = (from.get(key) - el.getBoundingClientRect().left) / scale;
      if (Math.abs(dx) > 0.5) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], options);
    }
  });

  // Destino de una suelta que se arrastra, con la geometría del inicio: en el
  // centro de una insignia la sustituye; en un hueco o en un borde de una
  // insignia se añade ahí. Con el marcador lleno, sustituye la más cercana.
  const paletteTargetAt = (x, y) => {
    const snap = paletteSnapRef.current;
    const none = { key: null, onBoard: false, index: null };
    if (!snap) return none;
    const { board, items } = snap;
    const padX = 16;
    const padY = Math.max(24, board.height);
    if (x < board.left - padX || x > board.right + padX || y < board.top - padY || y > board.bottom + padY) return none;
    if (!items.length) return { key: null, onBoard: true, index: 0 };
    if (snap.full) {
      const nearest = items.reduce((best, item) =>
        Math.abs(item.center - x) < Math.abs(best.center - x) ? item : best);
      return { key: nearest.key, onBoard: true, index: null };
    }
    const hit = items.find((item) => x >= item.left + item.width * 0.2 && x <= item.right - item.width * 0.2);
    if (hit) return { key: hit.key, onBoard: true, index: null };
    return { key: null, onBoard: true, index: items.filter((item) => item.center < x).length };
  };

  const snapshotBoard = () => {
    const board = boardRef.current;
    if (!board) return null;
    const items = [...board.querySelectorAll("[data-phone-score]")]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { key: el.dataset.phoneScore, left: rect.left, right: rect.right, width: rect.width, center: rect.left + rect.width / 2 };
      })
      .sort((a, b) => a.center - b.center);
    return { board: board.getBoundingClientRect(), items, full: list.length >= PHONE_SCORES_MAX };
  };

  const startDrag = (event, key, fromBoard) => {
    if (!event.isPrimary || event.button !== 0 || !key) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    paletteSnapRef.current = fromBoard ? null : snapshotBoard();
    sessionRef.current = { key, fromBoard, startX: event.clientX, startY: event.clientY, didMove: false, addIndex: null };
    // `moved`: hasta pasar el umbral de arrastre es un toque, sin bocadillo.
    setDrag({ key, fromBoard, x: event.clientX, y: event.clientY, targetKey: null, onBoard: fromBoard, addIndex: null, moved: false });
  };

  const startBoardDrag = (event) => {
    const key = event.target.closest?.("[data-phone-score]")?.dataset.phoneScore;
    if (!key) return;
    // Las insignias de ejemplo no llevan enlace, pero que nada las active.
    event.preventDefault();
    startDrag(event, key, true);
  };

  const moveDrag = (event) => {
    const session = sessionRef.current;
    if (!session) return;
    if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) > 8) {
      session.didMove = true;
    }
    const target = session.fromBoard
      ? dropTargetAt(event.clientX, event.clientY, session.key)
      : paletteTargetAt(event.clientX, event.clientY);
    const targetKey = target.key === session.key ? null : target.key;
    const addIndex = !session.fromBoard && target.onBoard && !targetKey ? target.index : null;
    // El hueco «+» aparece, se mueve o se va: el marcador se recoloca animado.
    if (addIndex !== session.addIndex) {
      session.addIndex = addIndex;
      captureBoardFlip();
    }
    setDrag((current) =>
      current && {
        ...current,
        x: event.clientX,
        y: event.clientY,
        targetKey,
        onBoard: target.onBoard,
        addIndex,
        moved: session.didMove,
      },
    );
  };

  const endDrag = (event, commit = true) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setDrag(null);
    if (!session) return;
    suppressClickRef.current = !session.fromBoard && session.didMove;
    // Toque sin arrastre sobre una del marcador: elegir otra o quitarla, en un
    // modal en escritorio y en la hoja inferior en el móvil.
    if (commit && session.fromBoard && !session.didMove) {
      const wide = window.matchMedia?.("(min-width: 768px)").matches;
      setPickedKey(session.key);
      setPicker({ key: session.key, mode: wide ? "modal" : "sheet" });
      return;
    }
    // Al soltar en el hueco «+», la nueva ocupa su sitio sin saltar: parte de
    // donde estaba el hueco.
    if (session.addIndex != null) {
      captureBoardFlip();
      const from = flipFromRef.current;
      if (from.has("+")) from.set(session.key, from.get("+"));
    }
    if (!commit || !session.didMove) return;
    const { key: targetKey, onBoard, index } = session.fromBoard
      ? dropTargetAt(event.clientX, event.clientY, session.key)
      : paletteTargetAt(event.clientX, event.clientY);
    const { key } = session;
    if (session.fromBoard) {
      if (!onBoard) {
        setList((current) => removePhoneScore(current, key, mediaType));
      } else if (targetKey && targetKey !== key) {
        setList((current) => placePhoneScore(current, key, current.indexOf(targetKey), mediaType));
      } else if (!targetKey) {
        setList((current) => placePhoneScore(current, key, index, mediaType));
      }
      return;
    }
    if (targetKey) {
      setList((current) => replacePhoneScore(current, targetKey, key, mediaType));
    } else if (onBoard) {
      setList((current) => placePhoneScore(current, key, index, mediaType));
    }
  };

  const addByTap = (key) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setList((current) =>
      current.length < PHONE_SCORES_MAX ? placePhoneScore(current, key, current.length, mediaType) : current,
    );
  };

  const pickScore = (key) => {
    if (picker?.key === key) setPicker(null);
    else if (picker?.key) setList((current) => replacePhoneScore(current, picker.key, key, mediaType));
    else setList((current) => placePhoneScore(current, key, current.length, mediaType));
    setPicker(null);
  };

  const chipLabel = (option) =>
    `${option.label} · ${t("settings_phone_scores_drop_hint", "Arrástrala al marcador para añadirla o sobre otra para sustituirla")}`;
  const renderChips = (options, offset = 0) =>
    options.map((option, index) => (
      <ScoreChip
        key={option.key}
        option={option}
        index={index + offset}
        dragging={Boolean(drag?.moved && !drag.fromBoard && drag.key === option.key)}
        label={chipLabel(option)}
        onPointerDown={(event) => startDrag(event, option.key, false)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={(event) => endDrag(event, false)}
        onClick={() => addByTap(option.key)}
      />
    ));
  const leftChips = available.filter((_, index) => index % 2 === 0);
  const rightChips = available.filter((_, index) => index % 2 === 1);

  const draggedOption = drag ? optionFor(drag.key) : null;
  const pickedOption = pickedKey ? optionFor(pickedKey) : null;
  // La tocada sale también (marcada) entre las opciones, en su sitio del orden
  // de siempre.
  const replaceOptions = pickedKey
    ? phoneScoreOptionsFor(mediaType).filter((option) => option.key === pickedKey || !list.includes(option.key))
    : [];
  const canRemovePicked = list.length > 1 && list.includes(pickedKey);
  const removePicked = () => {
    if (picker?.key) setList((current) => removePhoneScore(current, picker.key, mediaType));
    setPicker(null);
  };
  const isTv = mediaType === "tv";
  const full = list.length >= PHONE_SCORES_MAX;
  // Dentro del marcador (sus insignias no son de este componente): la que se
  // va a sustituir solo se sombrea de fondo (sin borde de color; la sombra
  // sin desenfoque prolonga el fondo alrededor de la insignia) y la que se
  // arrastra desde el marcador se atenúa. El marcador no se marca nunca.
  const addSlotAt = drag && !drag.fromBoard && Number.isInteger(drag.addIndex) ? drag.addIndex : null;
  const boardStyle = [
    "[data-phone-board] [data-phone-score]{border-radius:4px;box-shadow:0 0 0 8px transparent;transition:background-color .18s,box-shadow .18s}",
    drag?.fromBoard && drag.moved ? `[data-phone-board] [data-phone-score="${drag.key}"]{opacity:.3}` : "",
    drag?.targetKey
      ? `[data-phone-board] [data-phone-score="${drag.targetKey}"]{background-color:rgb(255 255 255 / .14);box-shadow:0 0 0 8px rgb(255 255 255 / .14)}`
      : "",
  ].join("");

  const iconButton = SETTINGS_MODAL_ICON_BUTTON;
  return (
    <SettingsGlassModal
      open={isOpen}
      onClose={closeAndSave}
      onEscape={onEscape}
      titleId="phone-scores-editor-title"
      title={t("settings_phone_scores", "Puntuaciones en el móvil")}
      subtitle={t("settings_phone_scores_subtitle", "Hasta {max} por tipo").replaceAll("{max}", String(PHONE_SCORES_MAX))}
      icon={Gauge}
      closeLabel={t("close", "Cerrar")}
      headerClassName="p-4 sm:p-6"
      headerActions={
        <button
          type="button"
          onClick={() => setDraft({ movie: [...DEFAULT_PHONE_SCORES.movie], tv: [...DEFAULT_PHONE_SCORES.tv] })}
          className={iconButton}
          aria-label={t("settings_reset", "Restablecer")}
          title={t("settings_reset", "Restablecer")}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      }

      // Móvil: como mucho el alto de la pantalla, sin desplazamiento, y menos
      // si al teléfono le sobra alto (`--phone-spare`, ver usePhoneScale).
      // Escritorio: alto del contenido, desplaza si hace
      // falta.
      panelClassName="max-w-[56rem] select-none max-md:h-[calc(var(--sv-modal-max-h)-var(--phone-spare,0px))]"
      bodyClassName="flex min-h-0 flex-1 flex-col p-4 max-md:overflow-hidden max-md:pt-1 sm:p-5 md:overflow-y-auto md:overscroll-contain"
    >
        <style>{boardStyle}</style>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* En el móvil no hay texto de ayuda: Película / Serie va arriba del todo. */}
          <p className="pointer-events-none hidden items-center justify-center px-4 text-center text-xs leading-4 text-zinc-300 md:flex">
            {t("settings_phone_scores_drag_hint", "Arrastra las puntuaciones al marcador. Sácalas de él para quitarlas.")}
          </p>

          {/* Película / Serie: cada una con su lista. */}
          <div role="radiogroup" aria-label={t("settings_phone_scores_type", "Tipo de título")} className="mx-auto flex w-fit md:mt-2 rounded-full bg-black/30 p-1">
            {[
              { value: "movie", label: t("movie", "Película"), Icon: Clapperboard },
              { value: "tv", label: t("tv_show", "Serie"), Icon: Tv },
            ].map(({ value: type, label, Icon }) => {
              const active = mediaType === type;
              return (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMediaType(type)}
                  className={`flex min-h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${active ? "bg-white text-black" : "text-zinc-300 hover:text-white"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                  <span className={`tabular-nums ${active ? "text-black/50" : "text-zinc-500"}`}>
                    {draft[type].length}/{PHONE_SCORES_MAX}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col rounded-[1.8rem] bg-[radial-gradient(90%_140%_at_50%_0%,rgba(255,255,255,0.12),transparent_55%),rgba(255,255,255,0.04)] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.25)] sm:p-5">
            <div className="flex min-h-0 flex-1 items-stretch justify-center gap-6 md:items-center">
              <div role="group" aria-label={t("settings_phone_scores_available", "Puntuaciones disponibles")} className="hidden w-40 shrink-0 flex-col items-end gap-4 md:flex">
                {renderChips(leftChips, 0)}
              </div>

              {/* Ficha móvil de ejemplo: la vista inicial de la ficha en un
                  teléfono de 390 px, reducida para caber. */}
              <PhoneDetailsMock isTv={isTv}>
                <div className="flex items-stretch gap-2">
                <div
                  ref={boardRef}
                  data-phone-board=""
                  onPointerDown={startBoardDrag}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={(event) => endDrag(event, false)}
                  onClickCapture={(event) => event.preventDefault()}
                  className="min-w-0 flex-1 touch-none select-none rounded-2xl [&_*]:cursor-grab"
                >
                  <DetailsScoreboardPanel
                    phoneLayout
                    mobileScoresOnly
                    tmdb={SAMPLE_SCORES.tmdb}
                    trakt={SAMPLE_SCORES.trakt}
                    imdb={SAMPLE_SCORES.imdb}
                    rt={SAMPLE_SCORES.rt}
                    mc={SAMPLE_SCORES.mc}
                    lb={isTv ? null : SAMPLE_SCORES.lb}
                    phoneScores={list}
                    phoneAddSlotAt={addSlotAt}
                  />
                </div>
                {/* Móvil: hueco para añadir otra mientras quepan. */}
                {!full ? (
                  <button
                    type="button"
                    onClick={() => setPicker({ key: null })}
                    aria-label={t("settings_phone_scores_add", "Añadir puntuación")}
                    className="grid w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-white transition active:scale-95 md:hidden"
                  >
                    <Plus className="h-7 w-7" aria-hidden="true" />
                  </button>
                ) : null}
                </div>
              </PhoneDetailsMock>

              <div role="group" aria-label={t("settings_phone_scores_available", "Puntuaciones disponibles")} className="hidden w-40 shrink-0 flex-col items-start gap-4 md:flex">
                {renderChips(rightChips, 1)}
              </div>
            </div>
            {available.length === 0 ? (
              <div className="mt-4 hidden justify-center md:flex"><EmptyPalette t={t} /></div>
            ) : null}
          </div>

        </div>
        {/* Cambiar o quitar la tocada. Escritorio: modal con el armazón de
            los de Preferencias (los de los botones de acción de las fichas),
            encima del editor. Móvil: la hoja inferior de los menús móviles. */}
        <SettingsGlassModal
          open={picker?.mode === "modal"}
          onClose={() => setPicker(null)}
          titleId="phone-score-replace-title"
          title={t("settings_phone_scores_replace", "Cambiar puntuación")}
          subtitle={pickedOption?.label}
          icon={ArrowLeftRight}
          closeLabel={t("close", "Cerrar")}
          panelClassName="max-w-md"
        >
          {pickedOption ? (
            <ScoreReplaceOptions
              t={t}
              current={pickedOption}
              options={replaceOptions}
              canRemove={canRemovePicked}
              onPick={pickScore}
              onRemove={removePicked}
            />
          ) : null}
        </SettingsGlassModal>
        <MobileOptionsSheet
          open={picker?.mode === "sheet"}
          onClose={() => setPicker(null)}
          title={t("settings_phone_scores_replace", "Cambiar puntuación")}
          subtitle={pickedOption ? `${pickedOption.label} · ${isTv ? t("tv_show", "Serie") : t("movie", "Película")}` : null}
          icon={ArrowLeftRight}
        >
          <SheetOptionGroup label={t("settings_phone_scores_available", "Puntuaciones disponibles")}>
            {replaceOptions.map((option) => (
              <SheetOption
                key={option.key}
                active={option.key === pickedKey}
                onClick={() => pickScore(option.key)}
                // eslint-disable-next-line @next/next/no-img-element
                media={<img src={option.logo} alt="" className="h-4 w-auto max-w-[1.8rem] object-contain" />}
              >
                {option.label}
              </SheetOption>
            ))}
          </SheetOptionGroup>
          {canRemovePicked ? (
            <SheetOptionGroup label={t("settings_phone_scores_board", "Marcador")} className="mt-4">
              <SheetOption active={false} icon={X} onClick={removePicked}>
                {t("settings_phone_scores_remove", "Quitar del marcador")}
              </SheetOption>
            </SheetOptionGroup>
          ) : null}
        </MobileOptionsSheet>
        {/* Añadir («+», solo móvil): la hoja inferior de los menús de las
            páginas de usuario. Va en un portal; el toque sube por el árbol de
            React hasta la capa del modal, que lo para: no cierra el editor. La
            hoja apaga la página de debajo, pero no la capa del modal
            (`data-detail-modal-layer`). */}
        <MobileOptionsSheet
          open={picker !== null && picker.key === null}
          onClose={() => setPicker(null)}
          title={t("settings_phone_scores_add", "Añadir puntuación")}
          subtitle={`${isTv ? t("tv_show", "Serie") : t("movie", "Película")} · ${list.length}/${PHONE_SCORES_MAX}`}
          icon={Plus}
        >
          <SheetOptionGroup label={t("settings_phone_scores_available", "Puntuaciones disponibles")}>
            {available.map((option) => (
              <SheetOption
                key={option.key}
                active={false}
                onClick={() => pickScore(option.key)}
                // eslint-disable-next-line @next/next/no-img-element
                media={<img src={option.logo} alt="" className="h-4 w-auto max-w-[1.8rem] object-contain" />}
              >
                {option.label}
              </SheetOption>
            ))}
          </SheetOptionGroup>
        </MobileOptionsSheet>
      {draggedOption && drag?.moved && createPortal(
        <div
          aria-hidden="true"
          style={{ left: drag.x + 18, top: drag.y + 18 }}
          className="pointer-events-none fixed z-[10010] flex -translate-y-1/2 items-center gap-2 rounded-full bg-zinc-950/95 px-3 py-2 text-xs font-bold text-white shadow-[0_12px_30px_rgba(0,0,0,0.55),0_0_20px_rgba(110,231,183,0.22)] backdrop-blur-xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={draggedOption.logo} alt="" className="h-5 w-auto max-w-[2.2rem] object-contain" />
          <span>{draggedOption.label}</span>
        </div>,
        document.body,
      )}
    </SettingsGlassModal>
  );
}

// --- Teléfono de ejemplo ----------------------------------------------------
// La vista inicial de la ficha móvil (DetailsClient) en un teléfono de 430×844,
// con las medidas de la real: portada hasta los botones, logo encima de ellos,
// fila de 8 acciones de 46 px, el marcador 20 px debajo (solo puntuaciones,
// como antes de desplazar) y el navbar inferior. Se pinta a tamaño real y se
// reduce con `scale` para caber: así el marcador tiene el ancho de verdad y una
// cuarta puntuación se ve como en el teléfono.
const PHONE_W = 430;
const PHONE_H = 844;
const SAMPLE_TITLES = {
  movie: {
    title: "El club de la lucha",
    poster: "https://image.tmdb.org/t/p/w500/fFkMxrBYnEBcEHotxTQwx2nAncy.jpg",
    logo: "https://image.tmdb.org/t/p/w500/4XkF0Rf7gvSfea8fYLFbU5tmuJw.png",
  },
  tv: {
    title: "Juego de tronos",
    poster: "https://image.tmdb.org/t/p/w500/cjrSkULmG2btwLOEvWZCeO5KRY2.jpg",
    logo: "https://image.tmdb.org/t/p/w500/6pObznbCoxVpY1lPQwJxETd7Phe.png",
  },
};
// Medido en la ficha a 430 px: botones de 46,3 px repartidos entre márgenes
// de 16 px (4 px entre ellos); iconos de 21,3 px y 23,4 px los de estado.
const MOCK_ACTION_SIZE = 46.3;
const MOCK_ACTIONS = [
  { Icon: Play, solid: true },
  { Icon: AudioLines, solid: true },
  { Icon: EyeOff, state: true },
  { Icon: Star, state: true },
  { Icon: Heart, state: true },
  { Icon: BookmarkPlus, state: true },
  { Icon: ListPlus },
  { Icon: MessageSquare },
];
const MOCK_NAV = [UsersRound, ListVideo, Play, Eye, Heart, Bookmark];

function usePhoneScale(slotRef) {
  const [scale, setScale] = useState(0.7);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    // Móvil: el modal mide como mucho el alto de la pantalla y el teléfono se
    // ajusta al hueco que le queda. Si lo que manda es el ANCHO (pantallas
    // anchas para su alto), sobraría alto por encima y por debajo del teléfono:
    // ese sobrante se le quita al modal (`--phone-spare` en el panel, que
    // resta de su alto) y el modal se queda a la medida del contenido. El alto
    // disponible se calcula con el sobrante ya quitado sumado de vuelta, así
    // que si la pantalla cambia el modal también puede volver a crecer.
    let spare = 0;
    const update = () => {
      const byWidth = slot.clientWidth / PHONE_W;
      const panel = slot.closest("[role=dialog]");
      if (window.innerWidth >= 768) {
        // Escritorio: alto que deja el modal (cabecera y selector) en la ventana.
        if (spare) panel?.style.removeProperty("--phone-spare");
        spare = 0;
        setScale(Math.min(1, byWidth, Math.max(420, window.innerHeight * 0.9 - 250) / PHONE_H));
        return;
      }
      const maxHeight = slot.clientHeight + spare;
      const next = Math.min(1, byWidth, maxHeight / PHONE_H);
      const nextSpare = Math.max(0, Math.floor(maxHeight - PHONE_H * next));
      if (nextSpare !== spare) {
        spare = nextSpare;
        panel?.style.setProperty("--phone-spare", `${spare}px`);
      }
      setScale(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(slot);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      slot.closest("[role=dialog]")?.style.removeProperty("--phone-spare");
    };
  }, [slotRef]);
  return scale;
}

function PhoneDetailsMock({ isTv, children }) {
  const slotRef = useRef(null);
  const scale = usePhoneScale(slotRef);
  const sample = SAMPLE_TITLES[isTv ? "tv" : "movie"];
  return (
    <div ref={slotRef} className="flex min-h-0 min-w-0 max-w-[430px] flex-1 items-center justify-center overflow-hidden">
      <div className="relative shrink-0" style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
        <div
          className="absolute left-0 top-0 origin-top-left overflow-hidden rounded-[26px] bg-black shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
          style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {/* Portada: de arriba hasta los botones, fundida en negro abajo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={sample.poster} src={sample.poster} alt="" draggable={false} className="absolute left-[-4px] top-0 h-[622px] w-[calc(100%+8px)] object-cover object-bottom" />
            <div className="absolute inset-x-0 top-[380px] h-[260px] bg-gradient-to-b from-transparent via-black/70 to-black" />
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />

            {/* Barra superior: solo el logo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-TSV-sinFondo.png" alt="" draggable={false} className="absolute left-1/2 top-[-21px] h-[90px] w-[90px] -translate-x-1/2" />

            {/* Logo del título, apoyado sobre los botones. */}
            <div className="absolute inset-x-0 top-[506px] flex h-[96px] items-end justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img key={sample.logo} src={sample.logo} alt="" draggable={false} className="max-h-[96px] max-w-[205px] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
            </div>

            {/* Acciones. */}
            <div className="absolute inset-x-4 top-[622px] flex justify-between">
              {MOCK_ACTIONS.map(({ Icon, solid, state }, index) => (
                <span
                  key={index}
                  className={`grid place-items-center rounded-full ${solid ? "bg-white text-black" : "bg-white/10 text-white"}`}
                  style={{ width: MOCK_ACTION_SIZE, height: MOCK_ACTION_SIZE }}
                >
                  <Icon style={{ width: state ? 23.4 : 21.3, height: state ? 23.4 : 21.3 }} strokeWidth={2} />
                </span>
              ))}
            </div>

            {/* Navbar inferior. */}
            <div className="absolute inset-x-6 top-[776px] flex h-14 items-center justify-around rounded-full bg-zinc-800/80 pl-10 pr-3 text-white">
              <span className="absolute -left-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black text-sm font-black ">N</span>
              {MOCK_NAV.map((Icon, index) => (
                <Icon key={index} className="h-[22px] w-[22px]" />
              ))}
            </div>
          </div>

          {/* El marcador real: lo único que se toca. */}
          <div className="absolute inset-x-4 top-[688px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Contenido del modal de escritorio al tocar una puntuación del marcador:
// cambiarla por otra o quitarla.
function ScoreReplaceOptions({ t, current, options, canRemove, onPick, onRemove }) {
  return (
    <div>
      {options.length > 1 ? (
        <div className="grid grid-cols-2 gap-2">
          {options.map((option) => {
            const selected = option.key === current.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(option.key)}
                className={`flex min-h-12 items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${
                  selected
                    ? "bg-white/[0.14] text-white ring-1 ring-inset ring-white/40"
                    : "bg-white/[0.06] text-zinc-100 hover:bg-white/10"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={option.logo} alt="" className="h-5 w-auto max-w-[2.2rem] object-contain" />
                <span className="min-w-0 flex-1 leading-tight">{option.label}</span>
                {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyPalette t={t} />
      )}
      {canRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 text-sm font-bold text-red-300 transition active:scale-95 hover:bg-red-500/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          {t("settings_phone_scores_remove", "Quitar del marcador")}
        </button>
      ) : null}
    </div>
  );
}

function EmptyPalette({ t }) {
  return (
    <p className="text-xs text-zinc-500">
      {t("settings_phone_scores_all_in", "Todas están en el marcador.")}
    </p>
  );
}
