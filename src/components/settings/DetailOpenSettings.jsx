"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, PanelsTopLeft, X } from "lucide-react";
import { useServerOnline } from "@/context/ServerStatusContext";
import useBodyScrollLock from "@/hooks/useBodyScrollLock";
import { resolveDetailOpen, withDetailOpen } from "@/lib/ui/detailOpenPreferences";
import { detailOpenPreview } from "@/lib/ui/detailOpenPreview";
import styles from "./DetailOpenSettings.module.css";

function PreviewVideo({ value, scope, t }) {
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const preview = detailOpenPreview(value, scope);
  useEffect(() => {
    const video = videoRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!motion.matches) video?.play().catch(() => {});
    const pause = () => { if (motion.matches) video?.pause(); };
    const visibility = () => { if (document.hidden) video?.pause(); };
    motion.addEventListener("change", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      motion.removeEventListener("change", pause);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [preview]);
  return (
    <figure className="overflow-hidden rounded-2xl bg-black/30">
      <video
        ref={videoRef}
        className="aspect-[2/1] max-h-[60dvh] w-full object-contain lg:max-h-[calc(94dvh-22rem)]"
        src={`/previews/detail-open/${preview}.webm`}
        poster={`/previews/detail-open/${preview}.jpg`}
        muted playsInline disablePictureInPicture disableRemotePlayback preload="metadata"
        aria-label={t("settings_detail_open_video", "Demostración de la apertura de un título en The Show Verse")}
        onError={() => setFailed(true)}
      />
      {failed && <figcaption role="status" className="px-4 py-3 text-xs text-zinc-400">
        {t("settings_detail_open_video_error", "No se ha podido cargar el vídeo. Puedes seguir configurando la apertura.")}
      </figcaption>}
    </figure>
  );
}

function ScopeControls({ scope, uiSettings, disabled, onChange, t }) {
  const controlsId = useId();
  const value = resolveDetailOpen(uiSettings, scope);
  const panel = value.target === "panel";
  const side = panel && value.placement === "right";
  const sideHint = t("settings_detail_open_only_quick_side", "Solo con la ficha rápida lateral");
  const settings = [
    {
      key: "target",
      label: t("settings_detail_open_target", "Al seleccionar un título"),
      applies: true,
      options: [
        {
          value: "panel",
          label: t("settings_detail_open_panel", "Ficha rápida"),
        },
        {
          value: "page",
          label: t("settings_detail_open_page", "Ficha completa"),
        },
      ],
    },
    {
      key: "placement",
      label: t("settings_detail_open_placement", "Posición de la ficha"),
      hint: t("settings_detail_open_only_quick", "Solo con la ficha rápida"),
      applies: panel,
      options: [
        {
          value: "center",
          label: t("settings_detail_open_center", "Centrada"),
        },
        { value: "right", label: t("settings_detail_open_right", "Lateral") },
      ],
    },
    {
      key: "drawerView",
      label: t("settings_detail_open_drawer", "Panel lateral"),
      hint: sideHint,
      applies: side,
      options: [
        {
          value: "overlay",
          label: t("settings_detail_open_overlay", "Superpuesto"),
        },
        {
          value: "docked",
          label: t("settings_detail_open_docked", "Acoplado"),
        },
      ],
    },
    {
      key: "contentView",
      label: t("settings_detail_open_content", "Contenido del panel"),
      hint: sideHint,
      applies: side,
      options: [
        { value: "modal", label: t("settings_detail_open_modal", "Ficha") },
        {
          value: "mobile",
          label: t("settings_detail_open_mobile", "Vista teléfono"),
        },
      ],
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {settings.map((setting) => (
          <label key={setting.key} className={`flex min-w-0 flex-col gap-2 text-xs ${setting.applies ? "text-zinc-300" : "text-zinc-500"}`}>
            <span className="font-semibold">{setting.label}</span>
            <span className="relative block">
            <select
              aria-label={setting.label}
              aria-describedby={!setting.applies ? `${controlsId}-${setting.key}-hint` : undefined}
              value={value[setting.key]}
              disabled={disabled || !setting.applies}
              onChange={(event) => onChange(withDetailOpen(uiSettings, scope, { [setting.key]: event.target.value }))}
              className={styles.select}
            >
              {setting.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
            </span>
            {!setting.applies && <span id={`${controlsId}-${setting.key}-hint`} className="text-[11px]">{setting.hint}</span>}
          </label>
        ))}
      </div>
      <PreviewVideo key={detailOpenPreview(value, scope)} value={value} scope={scope} t={t} />
    </>
  );
}

export default function DetailOpenSettings({ uiSettings, disabled: disabledProp, onChange, panelClassName = "", t }) {
  const online = useServerOnline();
  const disabled = disabledProp || !online;
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("dashboard");
  const dialogRef = useRef(null);
  const headingId = useId();
  const scopeName = useId();
  useBodyScrollLock(open);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const title = t("settings_detail_open_title", "Al abrir un título");
  return (
    <>
      <div className={`${panelClassName} group flex items-center justify-between gap-4 rounded-2xl p-4 sm:p-5`}>
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-emerald-400">
            <PanelsTopLeft className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold tracking-wide text-white">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:text-sm">{t("settings_detail_open_summary", "Personaliza la apertura en dashboards y páginas de usuario.")}</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
          className="min-h-9 shrink-0 rounded-full bg-white/[0.07] px-5 text-xs font-semibold text-emerald-200 transition-colors hover:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-emerald-400 sm:text-sm">
          {t("settings_customize", "Personalizar")}
        </button>
      </div>
      <dialog ref={dialogRef} aria-labelledby={headingId} onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false); } }}
        className={`${styles.dialog} m-auto max-h-[94dvh] w-[calc(100%-2rem)] max-w-[90rem] overflow-y-auto overscroll-contain rounded-[1.75rem] p-0 text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm`}>
        {open && <div className="space-y-4 p-4 sm:p-6">
          <header className="flex items-start justify-between gap-4">
            <div>
              <h2 id={headingId} className="text-xl font-bold tracking-tight">{title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-400">{t("settings_detail_open_intro", "Elige dónde quieres aplicarlo y compara cómo se abre la ficha. En móvil siempre se abre la ficha completa.")}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("close", "Cerrar")}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400"><X size={20} /></button>
          </header>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <fieldset className={styles.scope}>
            <legend className="sr-only">{t("settings_detail_open_scope", "Aplicar en")}</legend>
            {[["dashboard", t("settings_detail_open_dashboards", "Dashboards")], ["userPages", t("settings_detail_open_user_pages", "Páginas de usuario")]].map(([key, label]) => (
              <label key={key} className="cursor-pointer">
                <input type="radio" className="peer sr-only" name={scopeName} value={key} checked={scope === key} onChange={() => setScope(key)} />
                <span className={styles.scopeOption}>{label}</span>
              </label>
            ))}
          </fieldset>
          <p className="max-w-xl text-xs leading-relaxed text-zinc-400">{scope === "dashboard"
            ? t("settings_detail_open_dashboards_desc", "Inicio, Películas y Series.")
            : t("settings_detail_open_user_pages_desc", "Favoritos, Pendientes, Historial, En progreso, listas, Perfil y Social.")}</p>
          </div>
          <ScopeControls scope={scope} uiSettings={uiSettings} disabled={disabled} onChange={onChange} t={t} />
          <p role="status" className="text-xs text-zinc-400">{!online
            ? t("settings_detail_open_offline", "Sin conexión: puedes ver las muestras, pero no cambiar los ajustes.")
            : disabledProp ? t("settings_detail_open_saving", "Guardando cambios…")
            : t("settings_detail_open_autosave", "Los cambios se guardan automáticamente para el ámbito seleccionado.")}</p>
        </div>}
      </dialog>
    </>
  );
}
