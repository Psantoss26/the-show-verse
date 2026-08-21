"use client";

import LiquidButton from "@/components/LiquidButton";
import { MOBILE_ACTION_BUTTON_CLASS } from "@/components/details/DetailActionsRow";
import LiquidGlassOpticalLayers from "@/components/ui/LiquidGlassOpticalLayers";
import { LIQUID_GLASS_ELEVATION, LIQUID_GLASS_SURFACE_CARD } from "@/lib/ui/liquidGlass";
import { ArrowLeft, Eraser, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

const ROW_CLASS = `flex w-full flex-nowrap items-center justify-center gap-1 sm:justify-start sm:gap-3
  [&>*]:flex-1 [&>*]:min-w-[34px] sm:[&>*]:max-w-[52px]
  ${MOBILE_ACTION_BUTTON_CLASS}`;

function ActionButton({ label, children, disabled, onClick, tone = "blue" }) {
  return (
    <LiquidButton
      type="button"
      liquidGlass
      groupId="list-details-actions"
      title={label}
      aria-label={label}
      activeColor={tone}
      disabled={disabled}
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

/** Fila de gestión de una lista personal, visualmente alineada con DetailsClient. */
export default function ListDetailsActionRow({
  onBack,
  onAdd,
  onEdit,
  onClear,
  onDelete,
  clearDisabled = false,
  clearing = false,
  deleting = false,
  favoriteAction = null,
  externalHref = null,
  externalLabel = "Ver en fuente externa",
}) {
  return (
    <div className={ROW_CLASS}>
      <ActionButton label="Retroceder" onClick={onBack}>
        <ArrowLeft />
      </ActionButton>
      {favoriteAction}
      <ActionLink href={externalHref} label={externalLabel} />
      {onAdd ? <ActionButton label="Añadir títulos" onClick={onAdd} tone="purple"><Plus /></ActionButton> : null}
      {onEdit ? <ActionButton label="Editar lista" onClick={onEdit} tone="yellow"><Pencil /></ActionButton> : null}
      {onClear ? <ActionButton label="Vaciar lista" onClick={onClear} disabled={clearDisabled || clearing} tone="yellow">{clearing ? <Loader2 className="animate-spin" /> : <Eraser />}</ActionButton> : null}
      {onDelete ? <ActionButton label="Borrar lista" onClick={onDelete} disabled={deleting} tone="red">{deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}</ActionButton> : null}
    </div>
  );
}
