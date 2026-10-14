"use client";

import { useId } from "react";
import { useServerOnline } from "@/context/ServerStatusContext";
import {
  resolveDetailOpen,
  withDetailOpen,
} from "@/lib/ui/detailOpenPreferences";

// «AL ABRIR UN TÍTULO» (escritorio): qué pasa al pulsar un título en los
// dashboards y en las páginas de usuario (lib/ui/detailOpenPreferences). Cada
// ámbito ocupa todo el ancho con sus cuatro ajustes en fila, y cada opción
// lleva una miniatura del resultado para comparar una con otra. Los ajustes
// que no aplican (posición con la ficha completa; modo y contenido sin el panel
// lateral) se quedan en su sitio atenuados para que la fila no salte.

// Paleta de las miniaturas: neutros fijos y el acento en `currentColor`, que es
// esmeralda en la opción elegida y gris en el resto.
const INK = {
  page: "#0c0c0f",
  frame: "rgba(255,255,255,0.09)",
  nav: "#1f1f23",
  card: "#2a2a30",
  cardDim: "#1c1c21",
  panel: "#16161a",
  line: "#3f3f46",
  shade: "rgba(0,0,0,0.55)",
};

const W = 160;
const H = 100;
const NAV = 9;

function Frame({ children }) {
  const clipId = `sv-detail-open-clip${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="0.5"
        y="0.5"
        width={W - 1}
        height={H - 1}
        rx="7"
        fill={INK.page}
        stroke={INK.frame}
      />
      <g clipPath={`url(#${clipId})`}>{children}</g>
      <defs>
        <clipPath id={clipId}>
          <rect x="1" y="1" width={W - 2} height={H - 2} rx="6.5" />
        </clipPath>
      </defs>
    </svg>
  );
}

function Nav() {
  return (
    <g>
      <rect x="0" y="0" width={W} height={NAV} fill={INK.nav} />
      <circle cx="8" cy={NAV / 2} r="2" fill={INK.line} />
      <rect
        x="14"
        y={NAV / 2 - 1}
        width="18"
        height="2"
        rx="1"
        fill={INK.line}
      />
      <rect
        x={W - 30}
        y={NAV / 2 - 1}
        width="22"
        height="2"
        rx="1"
        fill={INK.line}
      />
    </g>
  );
}

// Rejilla de pósters de la página de fondo dentro de [x0, x1].
function Posters({ x0 = 8, x1 = W - 8, cols = 6, dim = false }) {
  const gap = 4;
  const w = (x1 - x0 - gap * (cols - 1)) / cols;
  const h = w * 1.45;
  const rows = [NAV + 8, NAV + 8 + h + 5];
  return (
    <g>
      {rows.map((y) =>
        Array.from({ length: cols }, (_, i) => (
          <rect
            key={`${y}-${i}`}
            x={x0 + i * (w + gap)}
            y={y}
            width={w}
            height={h}
            rx="2"
            fill={dim ? INK.cardDim : INK.card}
          />
        )),
      )}
    </g>
  );
}

function Lines({ x, y, widths, gap = 5, h = 2.5 }) {
  return widths.map((w, i) => (
    <rect
      key={i}
      x={x}
      y={y + i * gap}
      width={w}
      height={h}
      rx={h / 2}
      fill={INK.line}
    />
  ));
}

function Buttons({ x, y, count = 3, w = 9 }) {
  return Array.from({ length: count }, (_, i) => (
    <rect
      key={i}
      x={x + i * (w + 3)}
      y={y}
      width={w}
      height="5"
      rx="2.5"
      fill={i === 0 ? "currentColor" : INK.line}
      opacity={i === 0 ? 0.85 : 1}
    />
  ));
}

// Ficha de DetailModal en una caja: portada horizontal arriba y dos columnas.
function ModalContent({ x, y, w, h }) {
  const hero = h * 0.38;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={hero}
        fill="currentColor"
        opacity="0.28"
      />
      <rect
        x={x}
        y={y + hero * 0.55}
        width={w}
        height={hero * 0.45}
        fill={INK.panel}
        opacity="0.55"
      />
      <rect
        x={x + 5}
        y={y + hero - 7}
        width={w * 0.45}
        height="3.5"
        rx="1.75"
        fill="#e4e4e7"
        opacity="0.9"
      />
      <Buttons x={x + 5} y={y + hero + 4} />
      <Lines
        x={x + 5}
        y={y + hero + 14}
        widths={[w * 0.5, w * 0.42, w * 0.47]}
      />
      <rect
        x={x + w * 0.62}
        y={y + hero + 12}
        width={w * 0.32}
        height={h - hero - 16}
        rx="2"
        fill={INK.card}
      />
    </g>
  );
}

// Vista teléfono en una caja: póster vertical centrado, título y una columna.
function PhoneContent({ x, y, w, h }) {
  const pw = Math.min(w * 0.42, h * 0.36);
  const ph = pw * 1.45;
  const cx = x + w / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={ph * 0.8}
        fill="currentColor"
        opacity="0.14"
      />
      <rect
        x={cx - pw / 2}
        y={y + 6}
        width={pw}
        height={ph}
        rx="2.5"
        fill="currentColor"
        opacity="0.55"
      />
      <rect
        x={cx - w * 0.22}
        y={y + ph + 10}
        width={w * 0.44}
        height="3.5"
        rx="1.75"
        fill="#e4e4e7"
        opacity="0.9"
      />
      <Buttons x={cx - 16.5} y={y + ph + 17} />
      <Lines x={x + 6} y={y + ph + 27} widths={[w - 12, w - 18, w - 14]} />
    </g>
  );
}

function SidePanel({ x, children }) {
  return (
    <g>
      <rect
        x={x - 3}
        y={NAV}
        width="3"
        height={H - NAV}
        fill="#000"
        opacity="0.35"
      />
      <rect x={x} y={NAV} width={W - x} height={H - NAV} fill={INK.panel} />
      <rect
        x={x}
        y={NAV}
        width="0.8"
        height={H - NAV}
        fill="currentColor"
        opacity="0.5"
      />
      {children}
    </g>
  );
}

const PANEL_X = 92;

const PREVIEWS = {
  // Ficha rápida: la ficha sobre la página, que sigue detrás.
  panel: () => (
    <Frame>
      <Nav />
      <Posters dim />
      <rect x="0" y={NAV} width={W} height={H - NAV} fill={INK.shade} />
      <rect
        x="28"
        y="15"
        width="104"
        height="80"
        rx="5"
        fill={INK.panel}
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <ModalContent x={28} y={15} w={104} h={80} />
    </Frame>
  ),
  // Ficha completa: se navega a la página del título.
  page: () => (
    <Frame>
      <rect
        x="0"
        y="0"
        width={W}
        height="52"
        fill="currentColor"
        opacity="0.3"
      />
      <rect x="0" y="30" width={W} height="22" fill={INK.page} opacity="0.6" />
      <Nav />
      <rect
        x="10"
        y="26"
        width="26"
        height="38"
        rx="2.5"
        fill="currentColor"
        opacity="0.6"
      />
      <rect
        x="42"
        y="40"
        width="52"
        height="4.5"
        rx="2.25"
        fill="#e4e4e7"
        opacity="0.9"
      />
      <Buttons x={42} y={50} count={4} />
      <Lines x={42} y={60} widths={[70, 58]} />
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={i}
          x={10 + i * 24}
          y="74"
          width="20"
          height="22"
          rx="2"
          fill={INK.card}
        />
      ))}
    </Frame>
  ),
  center: () => (
    <Frame>
      <Nav />
      <Posters dim />
      <rect x="0" y={NAV} width={W} height={H - NAV} fill={INK.shade} />
      <rect
        x="34"
        y="16"
        width="92"
        height="78"
        rx="5"
        fill={INK.panel}
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <ModalContent x={34} y={16} w={92} h={78} />
    </Frame>
  ),
  right: () => (
    <Frame>
      <Nav />
      <Posters />
      <SidePanel x={PANEL_X}>
        <ModalContent x={PANEL_X} y={NAV} w={W - PANEL_X} h={H - NAV} />
      </SidePanel>
    </Frame>
  ),
  // Superpuesto: el panel tapa parte de la página, que no se mueve.
  overlay: () => (
    <Frame>
      <Nav />
      <Posters />
      <rect
        x={PANEL_X}
        y={NAV}
        width={W - PANEL_X}
        height={H - NAV}
        fill="#000"
        opacity="0.2"
      />
      <SidePanel x={PANEL_X + 8}>
        <ModalContent x={PANEL_X + 8} y={NAV} w={W - PANEL_X - 8} h={H - NAV} />
      </SidePanel>
    </Frame>
  ),
  // Acoplado: la página se estrecha y el panel queda al lado.
  docked: () => (
    <Frame>
      <Nav />
      <Posters x1={PANEL_X - 6} cols={4} />
      <SidePanel x={PANEL_X}>
        <ModalContent x={PANEL_X} y={NAV} w={W - PANEL_X} h={H - NAV} />
      </SidePanel>
    </Frame>
  ),
  modal: () => (
    <Frame>
      <Nav />
      <Posters dim x1={70} cols={3} />
      <SidePanel x={76}>
        <ModalContent x={76} y={NAV} w={W - 76} h={H - NAV} />
      </SidePanel>
    </Frame>
  ),
  mobile: () => (
    <Frame>
      <Nav />
      <Posters dim x1={70} cols={3} />
      <SidePanel x={76}>
        <PhoneContent x={76} y={NAV} w={W - 76} h={H - NAV} />
      </SidePanel>
    </Frame>
  ),
};

function OptionTile({ option, active, disabled, onSelect }) {
  const Preview = PREVIEWS[option.value];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={() => onSelect(option.value)}
      className={`group flex min-w-0 flex-col gap-2 rounded-xl p-1.5 pb-2 text-left transition-[background-color,box-shadow,color] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed ${
        active
          ? "bg-emerald-400/[0.08] text-emerald-400 shadow-[inset_0_0_0_1.5px_rgba(52,211,153,0.75)]"
          : "bg-white/[0.03] text-zinc-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] enabled:hover:bg-white/[0.07] enabled:hover:text-zinc-400"
      }`}
    >
      <Preview />
      <span
        className={`px-1 text-xs font-bold leading-tight sm:text-[13px] ${active ? "text-white" : "text-zinc-400"}`}
      >
        {option.label}
      </span>
    </button>
  );
}

function OptionSetting({
  label,
  hint,
  value,
  options,
  applies,
  disabled,
  onChange,
  panelClassName,
}) {
  const blocked = disabled || !applies;
  return (
    // La atenuación va en el contenido y no en el panel: un `opacity` en el
    // panel de cristal le quitaría el desenfoque.
    <div className={`${panelClassName} flex flex-col rounded-2xl p-3.5`}>
      <div
        className={`flex flex-1 flex-col transition-opacity duration-200 ${applies ? "" : "opacity-45"}`}
      >
        <div className="mb-3 flex min-h-8 flex-col justify-center px-0.5">
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400/80">
            {label}
          </span>
          {!applies && hint ? (
            <span className="mt-0.5 text-[11px] leading-tight text-zinc-500">
              {hint}
            </span>
          ) : null}
        </div>
        <div
          role="radiogroup"
          aria-label={label}
          className="grid grid-cols-2 gap-2"
        >
          {options.map((option) => (
            <OptionTile
              key={option.value}
              option={option}
              active={value === option.value}
              disabled={blocked}
              onSelect={(next) => {
                if (next !== value) onChange(next);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopeBlock({
  scope,
  title,
  description,
  uiSettings,
  disabled,
  onChange,
  panelClassName,
  t,
}) {
  const value = resolveDetailOpen(uiSettings, scope);
  const panel = value.target === "panel";
  const side = panel && value.placement === "right";
  const sideHint = panel
    ? t("settings_detail_open_only_side", "Solo con la ficha lateral")
    : t(
        "settings_detail_open_only_quick_side",
        "Solo con la ficha rápida lateral",
      );

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1">
        <h4 className="text-sm font-bold text-white">{title}</h4>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {settings.map((setting) => (
          <OptionSetting
            key={setting.key}
            label={setting.label}
            hint={setting.hint}
            applies={setting.applies}
            options={setting.options}
            value={value[setting.key]}
            disabled={disabled}
            panelClassName={panelClassName}
            onChange={(next) => onChange(scope, { [setting.key]: next })}
          />
        ))}
      </div>
    </div>
  );
}

export default function DetailOpenSettings({
  uiSettings,
  disabled: disabledProp,
  onChange,
  panelClassName = "",
  t,
}) {
  const online = useServerOnline();
  const disabled = disabledProp || !online;
  const scopes = [
    {
      scope: "dashboard",
      title: t("settings_detail_open_dashboards", "Dashboards"),
      description: t(
        "settings_detail_open_dashboards_desc",
        "Inicio, Películas y Series.",
      ),
    },
    {
      scope: "userPages",
      title: t("settings_detail_open_user_pages", "Páginas de usuario"),
      description: t(
        "settings_detail_open_user_pages_desc",
        "Favoritos, Pendientes, Historial, En progreso, listas, Perfil y Social.",
      ),
    },
  ];

  return (
    <section className="space-y-5" aria-labelledby="settings-detail-open">
      <div className="px-1">
        <h3
          id="settings-detail-open"
          className="text-base font-bold text-white"
        >
          {t("settings_detail_open_title", "Al abrir un título")}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          {t(
            "settings_detail_open_desc",
            "Cómo se abre un título al pulsarlo en el ordenador. En el móvil se abre siempre la ficha completa. Los controles del propio panel también cambian estas preferencias.",
          )}
        </p>
      </div>
      {scopes.map((group) => (
        <ScopeBlock
          key={group.scope}
          {...group}
          uiSettings={uiSettings}
          disabled={disabled}
          panelClassName={panelClassName}
          t={t}
          onChange={(scope, patch) =>
            onChange(withDetailOpen(uiSettings, scope, patch))
          }
        />
      ))}
    </section>
  );
}
