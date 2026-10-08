"use client";

import { useServerOnline } from "@/context/ServerStatusContext";
import LiquidButton from "@/components/LiquidButton";
import {
  DETAIL_ACTION_ITEM_SIZING_CLASS,
  MOBILE_ACTION_BUTTON_CLASS,
} from "@/components/details/DetailActionsRow";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { useShareAction } from "@/components/details/DetailHeaderBits";
import { LIQUID_GLASS_ELEVATION, LIQUID_GLASS_SURFACE_CARD } from "@/lib/ui/liquidGlass";
import { ArrowLeft, Check, Eraser, ExternalLink, Loader2, Pencil, Plus, Share2, Trash2, Users } from "lucide-react";

const ROW_CLASS = `flex w-full flex-nowrap items-center justify-center gap-1 sm:justify-start sm:gap-3
  ${DETAIL_ACTION_ITEM_SIZING_CLASS}
  ${MOBILE_ACTION_BUTTON_CLASS}`;

function ActionButton({ label, children, disabled, onClick, tone = "blue", mutation = false }) {
  const online = useServerOnline();
  return (
    <LiquidButton
      type="button"
      liquidGlass
      groupId="list-details-actions"
      title={label}
      aria-label={label}
      activeColor={tone}
      disabled={disabled}
      readOnly={mutation && !online}
      onClick={onClick}
      className="!w-full !h-auto aspect-square"
    >
      {children}
    </LiquidButton>
  );
}

function ActionLink({ href, label }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      data-liquid-button="true"
      className={`relative isolate flex !h-auto !w-full aspect-square items-center justify-center overflow-hidden rounded-full text-zinc-200 transition hover:scale-105 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 ${LIQUID_GLASS_SURFACE_CARD} ${LIQUID_GLASS_ELEVATION}`}
    >
      <LiquidGlassOpticalLayers />
      <ExternalLink className="relative z-10" />
    </a>
  );
}

// Compartir como una acción más de la fila: abre la hoja de compartir con la
// imagen y el vídeo de la lista (lib/lists/shareList) o, sin ellos, manda el
// enlace. `share`: { title, text?, card?, story? }.
function ShareActionButton({ share }) {
  const title = share.title || "Lista";
  const text = share.text || `Echa un vistazo a ${title} en The Show Verse`;
  const { handleShare, sheet, copied } = useShareAction({
    title,
    text,
    url: share.url,
    card: share.card || null,
    story: share.story || null,
    kind: share.card ? "list" : "details",
  });
  const label = copied ? "¡Enlace copiado!" : "Compartir";
  return (
    <>
      <LiquidButton
        type="button"
        liquidGlass
        groupId="list-details-actions"
        title={label}
        aria-label={label}
        aria-haspopup={share.card ? "dialog" : undefined}
        activeColor="blue"
        onClick={handleShare}
        className="!w-full !h-auto aspect-square"
      >
        {copied ? <Check /> : <Share2 />}
      </LiquidButton>
      {sheet}
    </>
  );
}

/** Fila de gestión de una lista personal, visualmente alineada con DetailsClient. */
export default function ListDetailsActionRow({
  onBack,
  onAdd,
  onEdit,
  editLabel = "Editar lista",
  onClear,
  onDelete,
  clearDisabled = false,
  clearing = false,
  deleting = false,
  favoriteAction = null,
  externalHref = null,
  externalLabel = "Ver en fuente externa",
  onCast = null,
  castLabel = "Reparto destacado",
  share = null,
}) {
  return (
    <div className={ROW_CLASS}>
      <ActionButton label="Retroceder" onClick={onBack}>
        <ArrowLeft />
      </ActionButton>
      {favoriteAction}
      <ActionLink href={externalHref} label={externalLabel} />
      {onCast ? <ActionButton label={castLabel} onClick={onCast}><Users /></ActionButton> : null}
      {share ? <ShareActionButton share={share} /> : null}
      {onAdd ? <ActionButton mutation label="Añadir títulos" onClick={onAdd} tone="purple"><Plus /></ActionButton> : null}
      {onEdit ? <ActionButton mutation label={editLabel} onClick={onEdit} tone="yellow"><Pencil /></ActionButton> : null}
      {onClear ? <ActionButton mutation label="Vaciar lista" onClick={onClear} disabled={clearDisabled || clearing} tone="yellow">{clearing ? <Loader2 className="animate-spin" /> : <Eraser />}</ActionButton> : null}
      {onDelete ? <ActionButton mutation label="Borrar lista" onClick={onDelete} disabled={deleting} tone="red">{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}</ActionButton> : null}
    </div>
  );
}
