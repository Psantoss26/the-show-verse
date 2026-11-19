"use client";

// Gráficas de /admin, en su propio módulo para que recharts solo se descargue
// al abrir la página (ver AdminClient, next/dynamic).
//
// Colores (validados para fondo oscuro): series #3987e5 / #d95926; estados
// correctas / 4xx / 5xx con la paleta de estado reservada. Un solo eje Y por
// gráfica, leyenda solo con 2+ series y tooltip con el tramo completo.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { bucketLabel, formatCompact, formatCount, formatMs, tooltipLabel } from "./adminFormat";

export const SERIES = { primary: "#3987e5", secondary: "#d95926" };
export const STATUS = { ok: "#0ca30c", redirect: "#71717a", client: "#fab219", server: "#d03b3b" };

const AXIS = { fill: "#a1a1aa", fontSize: 11 };
const GRID = "rgba(255,255,255,0.06)";
const HEIGHT = 280;

function prepare(series, bucket) {
  return (series || []).map((p) => ({
    ...p,
    label: bucketLabel(p.t, bucket),
    ok: Math.max(0, p.requests - p.errors4xx - p.errors5xx),
  }));
}

function ChartTooltip({ active, payload, bucket, format, total }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="min-w-44 rounded-xl border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1.5 font-bold text-zinc-100">{tooltipLabel(point.t, bucket)}</div>
      <ul className="space-y-1">
        {[...payload].reverse().map((item) => (
          <li key={item.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className="tabular-nums text-zinc-100">{format(item.value)}</span>
          </li>
        ))}
        {total ? (
          <li className="flex items-center justify-between gap-4 border-t border-white/10 pt-1">
            <span className="text-zinc-400">Total</span>
            <span className="tabular-nums font-bold text-zinc-100">{format(point.requests)}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function Legend({ items }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          <span className={it.line ? "h-0.5 w-3 rounded" : "h-2 w-2 rounded-sm"} style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

const axes = (yFormat) => [
  <CartesianGrid key="g" stroke={GRID} vertical={false} />,
  <XAxis key="x" dataKey="label" tick={AXIS} minTickGap={32} tickLine={false} axisLine={false} />,
  <YAxis key="y" tick={AXIS} width={48} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={yFormat} />,
];

export function TrafficChart({ series, bucket }) {
  const data = prepare(series, bucket);
  return (
    <>
      <Legend
        items={[
          { label: "Correctas", color: STATUS.ok },
          { label: "Errores 4xx", color: STATUS.client },
          { label: "Errores 5xx", color: STATUS.server },
        ]}
      />
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
          {axes(formatCompact)}
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={<ChartTooltip bucket={bucket} format={formatCount} total />}
          />
          <Bar dataKey="ok" name="Correctas" stackId="s" fill={STATUS.ok} stroke="#09090b" strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="errors4xx" name="Errores 4xx" stackId="s" fill={STATUS.client} stroke="#09090b" strokeWidth={1} isAnimationActive={false} />
          <Bar dataKey="errors5xx" name="Errores 5xx" stackId="s" fill={STATUS.server} stroke="#09090b" strokeWidth={1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

export function UsersChart({ series, bucket }) {
  const data = prepare(series, bucket);
  return (
    <ResponsiveContainer width="100%" height={HEIGHT + 28}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="admin-users-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.3} />
            <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        {axes(formatCompact)}
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.2)" }}
          content={<ChartTooltip bucket={bucket} format={formatCount} />}
        />
        <Area
          type="monotone"
          dataKey="users"
          name="Usuarios con sesión"
          stroke={SERIES.primary}
          strokeWidth={2}
          fill="url(#admin-users-fill)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#09090b" }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LatencyChart({ series, bucket }) {
  const data = prepare(series, bucket);
  return (
    <>
      <Legend
        items={[
          { label: "Mediana (p50)", color: SERIES.primary, line: true },
          { label: "p95", color: SERIES.secondary, line: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={HEIGHT}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          {axes((v) => formatMs(v))}
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.2)" }}
            content={<ChartTooltip bucket={bucket} format={formatMs} />}
          />
          {/* Sin peticiones en un tramo no hay latencia: hueco, no 0 ms. */}
          <Line type="monotone" dataKey="p50Ms" name="Mediana (p50)" stroke={SERIES.primary} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#09090b" }} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="p95Ms" name="p95" stroke={SERIES.secondary} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#09090b" }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

/** Minigráfica de un KPI: sin ejes ni tooltip, solo la forma. */
export function Sparkline({ values, color = SERIES.primary }) {
  const data = (values || []).map((v, i) => ({ i, v }));
  if (data.filter((d) => d.v != null).length < 2) return <div className="h-8" />;
  return (
    <ResponsiveContainer width="100%" height={32}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
