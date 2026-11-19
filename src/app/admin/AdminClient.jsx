"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Gauge,
  Minus,
  RefreshCw,
  ServerCrash,
  Timer,
  Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  RANGES,
  RECENT_FILTERS,
  TIME_ZONE,
  compareToPrevious,
  countryFlag,
  countryName,
  deltaTone,
  filterRecent,
  formatCount,
  formatDateTime,
  formatDelta,
  formatMs,
  formatPercent,
  rate,
  statusFamilies,
  statusTone,
  timeAgo,
} from "./adminFormat";

// Estadísticas del administrador: peticiones al backend (request_log, ver
// backend/src/routes/admin.js) y enlace al panel de Umami para las visitas.

const chartFallback = () => <div className="h-[308px] animate-pulse rounded-xl bg-white/[0.03]" />;
const sparkFallback = () => <div className="h-8" />;
const charts = () => import("./adminCharts");
const TrafficChart = dynamic(() => charts().then((m) => m.TrafficChart), { ssr: false, loading: chartFallback });
const UsersChart = dynamic(() => charts().then((m) => m.UsersChart), { ssr: false, loading: chartFallback });
const LatencyChart = dynamic(() => charts().then((m) => m.LatencyChart), { ssr: false, loading: chartFallback });
const Sparkline = dynamic(() => charts().then((m) => m.Sparkline), { ssr: false, loading: sparkFallback });

const UMAMI_PANEL_URL = "https://stats.theshowverse.com";
const SPARK = { primary: "#3987e5", critical: "#d03b3b", warning: "#fab219", secondary: "#d95926" };

const TONE_BG = { ok: "bg-[#0ca30c]", redirect: "bg-zinc-500", client: "bg-[#fab219]", server: "bg-[#d03b3b]" };
const TONE_PILL = {
  ok: "bg-emerald-500/10 text-emerald-300",
  redirect: "bg-zinc-500/15 text-zinc-300",
  client: "bg-amber-400/10 text-amber-300",
  server: "bg-red-500/15 text-red-300",
};
const DELTA_TEXT = { good: "text-emerald-400", bad: "text-red-400", neutral: "text-zinc-400" };

const fmtClock = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtDate = new Intl.DateTimeFormat("es-ES", { timeZone: TIME_ZONE, dateStyle: "medium" });

async function getJson(url, signal) {
  const res = await fetch(url, { cache: "no-store", credentials: "include", signal });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

// ── Piezas comunes ───────────────────────────────────────────────────────────

function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-zinc-950/80 ${className}`}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.05] px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-bold text-zinc-100">{title}</h2> : null}
            {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </section>
  );
}

function Segmented({ options, value, onChange, label, size = "sm" }) {
  const pad = size === "xs" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-white/[0.07] bg-white/[0.03] p-0.5" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md transition-colors ${pad} ${
            value === o.key ? "bg-white/[0.12] text-white" : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
          }`}
        >
          {o.label}
          {o.count != null ? <span className="tabular-nums text-zinc-500">{formatCount(o.count)}</span> : null}
        </button>
      ))}
    </div>
  );
}

function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-zinc-500">{children}</p>;
}

function ShareBar({ value, max }) {
  const pct = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
      <div className="h-full rounded-full bg-[#3987e5]/70" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

function Delta({ current, previous, polarity }) {
  const cmp = compareToPrevious(current, previous);
  if (!cmp) return <span className="text-xs text-zinc-600" title="Sin datos en el periodo anterior">—</span>;
  const tone = deltaTone(cmp, polarity);
  const Icon = cmp.kind === "new" || cmp.direction === "up" ? ArrowUpRight : cmp.direction === "down" ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs tabular-nums ${DELTA_TEXT[tone]}`} title="Frente al periodo anterior del mismo largo">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {formatDelta(cmp)}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, hint, current, previous, polarity, spark, sparkColor }) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-zinc-950/80 px-3 pb-3 pt-3 sm:px-4 sm:pt-3.5">
      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="truncate text-2xl font-bold tabular-nums text-white">{value}</span>
        <Delta current={current} previous={previous} polarity={polarity} />
      </div>
      <div className="mt-0.5 truncate text-xs text-zinc-500">{hint}</div>
      <div className="mt-2">
        <Sparkline values={spark} color={sparkColor} />
      </div>
    </div>
  );
}

function KpiGrid({ data, single = false }) {
  const t = data.totals || {};
  const p = data.previous || null;
  const s = data.series || [];
  const rate5 = (x) => rate(x.errors5xx, x.requests);
  const rate4 = (x) => rate(x.errors4xx, x.requests);
  // Sin peticiones no hay latencia: «—», no 0 ms.
  const ms = (x, key) => (x?.requests ? x[key] : null);
  const items = [
    {
      icon: Activity, label: "Peticiones", value: formatCount(t.requests),
      hint: single ? "en este periodo" : `${formatCount(t.anonymous)} sin sesión · ${formatCount(t.ips)} redes`,
      current: t.requests, previous: p?.requests, polarity: "up-good",
      spark: s.map((x) => x.requests), sparkColor: SPARK.primary,
    },
    // De un solo usuario no tiene sentido contar usuarios: sus redes (IP).
    single ? {
      icon: Users, label: "Redes", value: formatCount(t.ips),
      hint: "direcciones IP distintas",
      current: t.ips, previous: p?.ips, polarity: "neutral",
      spark: [], sparkColor: SPARK.primary,
    } : {
      icon: Users, label: "Usuarios con sesión", value: formatCount(t.users),
      hint: t.requests ? `${formatPercent(t.requests - t.anonymous, t.requests)} de las peticiones` : "—",
      current: t.users, previous: p?.users, polarity: "up-good",
      spark: s.map((x) => x.users), sparkColor: SPARK.primary,
    },
    {
      icon: ServerCrash, label: "Errores del servidor (5xx)", value: formatPercent(t.errors5xx, t.requests),
      hint: `${formatCount(t.errors5xx)} peticiones`,
      current: rate5(t), previous: p ? rate5(p) : null, polarity: "up-bad",
      spark: s.map(rate5), sparkColor: SPARK.critical,
    },
    {
      icon: AlertTriangle, label: "Errores del cliente (4xx)", value: formatPercent(t.errors4xx, t.requests),
      hint: `${formatCount(t.errors4xx)} peticiones`,
      current: rate4(t), previous: p ? rate4(p) : null, polarity: "up-bad",
      spark: s.map(rate4), sparkColor: SPARK.warning,
    },
    {
      icon: Timer, label: "Respuesta mediana (p50)", value: formatMs(ms(t, "p50Ms")),
      hint: "la mitad responde antes",
      current: ms(t, "p50Ms"), previous: ms(p, "p50Ms"), polarity: "up-bad",
      spark: s.map((x) => x.p50Ms), sparkColor: SPARK.primary,
    },
    {
      icon: Gauge, label: "Respuesta p95", value: formatMs(ms(t, "p95Ms")),
      hint: "el 5 % más lento tarda más",
      current: ms(t, "p95Ms"), previous: ms(p, "p95Ms"), polarity: "up-bad",
      spark: s.map((x) => x.p95Ms), sparkColor: SPARK.secondary,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      {items.map((item) => (
        <Kpi key={item.label} {...item} />
      ))}
    </div>
  );
}

// ── Gráfica principal ────────────────────────────────────────────────────────

const CHART_TABS = [
  { key: "traffic", label: "Tráfico", subtitle: "Peticiones por resultado" },
  { key: "users", label: "Usuarios", subtitle: "Usuarios distintos con sesión" },
  { key: "latency", label: "Latencia", subtitle: "Tiempo de respuesta del backend" },
];

const BUCKET_TEXT = { minute: "por minuto", hour: "por hora", day: "por día" };

function MainChart({ data, single = false }) {
  const [tab, setTab] = useState("traffic");
  // La gráfica de usuarios de un solo usuario sería una línea plana en 1.
  const tabs = single ? CHART_TABS.filter((c) => c.key !== "users") : CHART_TABS;
  const current = tabs.find((c) => c.key === tab) || tabs[0];
  const empty = !data.totals?.requests;
  const Chart = current.key === "users" ? UsersChart : current.key === "latency" ? LatencyChart : TrafficChart;
  return (
    <Card
      title={current.label}
      subtitle={`${current.subtitle} ${BUCKET_TEXT[data.bucket] || ""} · hora de Madrid`}
      actions={<Segmented options={tabs} value={current.key} onChange={setTab} label="Gráfica" size="xs" />}
    >
      {empty ? (
        <div className="flex h-[308px] items-center justify-center">
          <Empty>Sin peticiones en este periodo</Empty>
        </div>
      ) : (
        <Chart series={data.series} bucket={data.bucket} />
      )}
    </Card>
  );
}

// ── Tablas ───────────────────────────────────────────────────────────────────

const th = "px-3 pb-2 text-xs font-normal text-zinc-500";

function Avatar({ user, size = "h-8 w-8" }) {
  const name = user.displayName || user.username || "?";
  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-zinc-200`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function UsersTable({ rows, onUser }) {
  if (!rows?.length) return <Empty>Nadie con sesión en este periodo</Empty>;
  const max = Math.max(...rows.map((u) => u.count), 1);
  return (
    <div className="-mx-4 -mb-4 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="text-left">
          <tr>
            <th className={`${th} pl-4`}>Usuario</th>
            <th className={`${th} w-44`}>Peticiones</th>
            <th className={`${th} text-right`}>Errores</th>
            <th className={`${th} text-right`}>Redes</th>
            <th className={`${th} pr-4 text-right`}>Última</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.userId} onClick={() => onUser(u.userId)} className="cursor-pointer border-t border-white/[0.04] hover:bg-white/[0.03]">
              <td className="py-2 pl-4 pr-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUser(u.userId);
                  }}
                  className="flex min-w-0 items-center gap-2.5 text-left"
                >
                  <Avatar user={u} />
                  <span className="min-w-0">
                    <span className="block max-w-[14rem] truncate text-zinc-100">{u.displayName || u.username}</span>
                    <span className="block max-w-[14rem] truncate text-xs text-zinc-500">@{u.username}</span>
                  </span>
                </button>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-right tabular-nums text-zinc-100">{formatCount(u.count)}</span>
                  <ShareBar value={u.count} max={max} />
                </div>
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${u.errors ? "text-amber-300" : "text-zinc-600"}`}>{formatCount(u.errors)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatCount(u.ips)}</td>
              <td className="whitespace-nowrap py-2 pl-3 pr-4 text-right text-zinc-400" title={formatDateTime(u.lastSeen)}>
                {timeAgo(u.lastSeen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Route({ method, route }) {
  return (
    <span className="flex min-w-0 items-center gap-2 font-mono text-xs" title={`${method} ${route}`}>
      <span className="w-11 shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-center text-[10px] text-zinc-400">{method}</span>
      <span className="truncate text-zinc-200">{route}</span>
    </span>
  );
}

const ROUTE_TABS = [
  { key: "topRoutes", label: "Más pedidas", hint: "Por número de peticiones", empty: "Sin peticiones en este periodo" },
  { key: "slowRoutes", label: "Más lentas", hint: "Por p95, con 5 peticiones o más", empty: "Ninguna ruta con 5 peticiones o más" },
  { key: "errorRoutes", label: "Con errores", hint: "Primero las que más fallan en el servidor", empty: "Sin errores en este periodo" },
];

function RoutesCard({ data, title, className = "" }) {
  const [tab, setTab] = useState("topRoutes");
  const current = ROUTE_TABS.find((r) => r.key === tab);
  const rows = data[tab] || [];
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card
      title={title}
      subtitle={current.hint}
      className={className}
      actions={
        <Segmented options={ROUTE_TABS.map((r) => ({ ...r, count: data[r.key]?.length ?? 0 }))} value={tab} onChange={setTab} label="Rutas" size="xs" />
      }
    >
      {!rows.length ? (
        <Empty>{current.empty}</Empty>
      ) : (
        <div className="-mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] table-fixed text-sm">
            <thead className="text-left">
              <tr>
                <th className={`${th} pl-4`}>Ruta</th>
                <th className={`${th} w-36`}>Peticiones</th>
                <th className={`${th} w-[4.5rem] text-right`}>Media</th>
                <th className={`${th} w-[4.5rem] text-right`}>p95</th>
                <th className={`${th} w-12 text-right`}>4xx</th>
                <th className={`${th} w-14 pr-4 text-right`}>5xx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.method} ${r.route}`} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2 pl-4 pr-3">
                    <Route method={r.method} route={r.route} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-right tabular-nums text-zinc-100">{formatCount(r.count)}</span>
                      <ShareBar value={r.count} max={max} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatMs(r.avgMs)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${tab === "slowRoutes" ? "text-zinc-100" : "text-zinc-400"}`}>{formatMs(r.p95Ms)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.errors4xx ? "text-amber-300" : "text-zinc-600"}`}>{formatCount(r.errors4xx)}</td>
                  <td className={`py-2 pl-3 pr-4 text-right tabular-nums ${r.errors5xx ? "text-red-400" : "text-zinc-600"}`}>{formatCount(r.errors5xx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Desgloses ────────────────────────────────────────────────────────────────

const FAMILY_LABEL = {
  "1xx": "Informativas",
  "2xx": "Correctas",
  "3xx": "Redirecciones",
  "4xx": "Errores del cliente",
  "5xx": "Errores del servidor",
};

function StatusCard({ data }) {
  const families = statusFamilies(data.statusCodes);
  const total = families.reduce((sum, f) => sum + f.count, 0);
  return (
    <Card title="Respuestas" subtitle="Por familia de código">
      {!total ? (
        <Empty>Sin datos</Empty>
      ) : (
        <div className="space-y-4">
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Reparto de códigos de respuesta">
            {families.map((f) => (
              <div
                key={f.family}
                className={`${TONE_BG[f.tone]} h-full`}
                style={{ width: `${(f.count / total) * 100}%` }}
                title={`${FAMILY_LABEL[f.family] || f.family}: ${formatPercent(f.count, total)}`}
              />
            ))}
          </div>
          <ul className="space-y-3">
            {families.map((f) => (
              <li key={f.family}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-zinc-200">
                    <span className={`h-2 w-2 rounded-sm ${TONE_BG[f.tone]}`} />
                    {FAMILY_LABEL[f.family] || f.family}
                  </span>
                  <span className="tabular-nums text-zinc-100">
                    {formatCount(f.count)} <span className="text-zinc-500">· {formatPercent(f.count, total)}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
                  {f.codes.map((c) => (
                    <span key={c.status} className={`rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${TONE_PILL[f.tone]}`}>
                      {c.status} <span className="opacity-70">×{formatCount(c.count)}</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function SharesCard({ title, subtitle, rows, render }) {
  const list = rows || [];
  const total = list.reduce((sum, r) => sum + r.count, 0);
  const max = Math.max(...list.map((r) => r.count), 1);
  return (
    <Card title={title} subtitle={subtitle}>
      {!list.length ? (
        <Empty>Sin datos</Empty>
      ) : (
        <ul className="space-y-2.5">
          {list.slice(0, 8).map((row, i) => (
            <li key={i}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-zinc-200">{render(row)}</span>
                <span className="shrink-0 tabular-nums text-zinc-100">
                  {formatCount(row.count)} <span className="text-zinc-500">· {formatPercent(row.count, total)}</span>
                </span>
              </div>
              <div className="mt-1">
                <ShareBar value={row.count} max={max} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Breakdowns({ data }) {
  return (
    <>
      <SharesCard title="Países" subtitle="Según Cloudflare" rows={data.countries} render={(r) => `${countryFlag(r.country)}  ${countryName(r.country)}`} />
      <SharesCard title="Clientes" subtitle="Por agente de usuario" rows={data.clients} render={(r) => r.kind} />
    </>
  );
}

// ── Últimas peticiones ───────────────────────────────────────────────────────

function RecentCard({ rows, onUser, showUser = true }) {
  const [filter, setFilter] = useState("all");
  const list = rows || [];
  const options = RECENT_FILTERS.filter((f) => showUser || (f.key !== "users" && f.key !== "anonymous")).map((f) => ({
    ...f,
    count: filterRecent(list, f.key).length,
  }));
  const visible = filterRecent(list, filter);
  return (
    <Card
      title="Últimas peticiones"
      subtitle={`Las ${formatCount(list.length)} más recientes, de cualquier periodo`}
      actions={<Segmented options={options} value={filter} onChange={setFilter} label="Filtrar peticiones" size="xs" />}
    >
      {!visible.length ? (
        <Empty>{list.length ? "Ninguna petición con este filtro" : "Sin peticiones todavía"}</Empty>
      ) : (
        <div className="-mx-4 -mb-4 max-h-[30rem] overflow-auto">
          <table className="w-full min-w-[40rem] table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950 text-left">
              <tr>
                <th className={`${th} w-24 pl-4 pt-1`}>Cuándo</th>
                {showUser ? <th className={`${th} w-44 pt-1`}>Quién</th> : null}
                <th className={`${th} pt-1`}>Petición</th>
                <th className={`${th} w-16 pt-1 text-right`}>Estado</th>
                <th className={`${th} w-20 pr-4 pt-1 text-right`}>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={`${r.ts}-${i}`} className="border-t border-white/[0.04] hover:bg-white/[0.02]" title={r.userAgent || ""}>
                  <td className="whitespace-nowrap py-1.5 pl-4 pr-3 text-xs text-zinc-400" title={formatDateTime(r.ts)}>
                    {timeAgo(r.ts)}
                  </td>
                  {showUser ? (
                    <td className="truncate px-3 py-1.5 text-xs">
                      <span className="mr-1.5" title={`${countryName(r.country)} · ${r.ip || "sin IP"}`}>
                        {countryFlag(r.country)}
                      </span>
                      {r.userId ? (
                        <button type="button" onClick={() => onUser?.(r.userId)} className="text-[#6ea8ee] hover:underline">
                          {r.username || r.userId.slice(0, 8)}
                        </button>
                      ) : (
                        <span className="text-zinc-500">sin sesión</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5">
                    <Route method={r.method} route={r.route} />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${TONE_PILL[statusTone(r.status)]}`}>{r.status}</span>
                  </td>
                  <td className={`py-1.5 pl-3 pr-4 text-right text-xs tabular-nums ${r.durationMs >= 1000 ? "text-amber-300" : "text-zinc-400"}`}>
                    {formatMs(r.durationMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Vistas ───────────────────────────────────────────────────────────────────

function Overview({ data, onUser }) {
  return (
    <>
      <KpiGrid data={data} />
      <MainChart data={data} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Usuarios más activos" subtitle="Con sesión, por peticiones" className="xl:col-span-2">
          <UsersTable rows={data.topUsers} onUser={onUser} />
        </Card>
        <StatusCard data={data} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <RoutesCard data={data} title="Rutas" className="xl:col-span-2" />
        <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Breakdowns data={data} />
        </div>
      </div>
      <RecentCard rows={data.recent} onUser={onUser} />
    </>
  );
}

function Skeleton() {
  const block = "animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.03]";
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando estadísticas">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${block} h-[124px]`} />
        ))}
      </div>
      <div className={`${block} h-[390px]`} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className={`${block} h-72 xl:col-span-2`} />
        <div className={`${block} h-72`} />
      </div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {message}
      </span>
      <button type="button" onClick={onRetry} className="rounded-md bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/15">
        Reintentar
      </button>
    </div>
  );
}

/** Carga una vista de /api/admin; conserva los datos previos si falla un refresco. */
function useStats(url, enabled, tick) {
  const [state, setState] = useState({ status: "loading", data: null, fetching: true, error: null });
  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, fetching: true }));
    getJson(url, ctrl.signal)
      .then(({ status, ok, body }) => {
        if (ok) return setState({ status: "ready", data: body, fetching: false, error: null });
        if (status === 401) return setState({ status: "anonymous", data: null, fetching: false, error: null });
        if (status === 403) return setState({ status: "forbidden", data: null, fetching: false, error: null });
        const error = body?.message || `Error ${status}`;
        return setState((s) => ({ ...s, status: s.data ? "ready" : "error", fetching: false, error }));
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState((s) => ({ ...s, status: s.data ? "ready" : "error", fetching: false, error: "Sin conexión con el servidor" }));
      });
    return () => ctrl.abort();
  }, [url, enabled, tick]);
  return state;
}

function UserHeader({ user, onClose }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.07]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Todos
      </button>
      {user ? (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar user={user} size="h-10 w-10" />
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-white">{user.displayName || user.username}</div>
            <div className="text-xs text-zinc-500">
              <Link href={`/u/${user.username}`} className="text-zinc-400 hover:underline">
                @{user.username}
              </Link>
              {user.createdAt ? ` · cuenta desde ${fmtDate.format(new Date(user.createdAt))}` : ""}
              {user.lastSeen ? ` · última petición ${timeAgo(user.lastSeen)}` : " · sin peticiones registradas"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserDetail({ userId, range, tick, onClose, onRetry }) {
  const url = `/api/admin/stats/users/${encodeURIComponent(userId)}?range=${range}`;
  const { status, data, error } = useStats(url, true, tick);
  return (
    <div className="space-y-4">
      <UserHeader user={data?.user} onClose={onClose} />
      {error ? <ErrorBanner message={data ? `${error}. Se muestran los últimos datos.` : error} onRetry={onRetry} /> : null}
      {!data && status === "loading" ? <Skeleton /> : null}
      {data ? (
        <>
          <KpiGrid data={data} single />
          <MainChart data={data} single />
          <div className="grid gap-4 xl:grid-cols-3">
            <RoutesCard data={data} title="Lo que pide" className="xl:col-span-2" />
            <StatusCard data={data} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Breakdowns data={data} />
          </div>
          <RecentCard rows={data.recent} showUser={false} />
        </>
      ) : null}
    </div>
  );
}

export default function AdminClient() {
  const { authenticated, hydrated } = useAuth();
  const [range, setRange] = useState("24h");
  const [userId, setUserId] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const overview = useStats(`/api/admin/stats?range=${range}`, hydrated && authenticated, tick);
  const status = hydrated && !authenticated ? "anonymous" : overview.status;
  const { data, fetching, error } = overview;

  // Al día sin recargar: cada minuto mientras la pestaña está a la vista.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const openUser = useCallback((id) => {
    setUserId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const updated = useMemo(() => (data?.generatedAt ? fmtClock.format(new Date(data.generatedAt)) : null), [data?.generatedAt]);

  if (status === "anonymous" || status === "forbidden") {
    return (
      <main className="mx-auto flex min-h-[70svh] max-w-md flex-col items-center justify-center px-6 pt-24 text-center">
        <h1 className="text-xl font-bold text-white">{status === "anonymous" ? "Inicia sesión" : "Solo administradores"}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {status === "anonymous" ? "Esta página necesita una sesión de administrador." : "Tu cuenta no tiene acceso a las estadísticas."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-4 pb-16 pt-24 text-zinc-100 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white">Estadísticas</h1>
          <p className="text-sm text-zinc-500">
            Peticiones al backend en {RANGES.find((r) => r.key === range)?.long}
            {updated ? ` · actualizado a las ${updated}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented options={RANGES} value={range} onChange={setRange} label="Periodo" />
          <button
            type="button"
            onClick={refresh}
            disabled={fetching}
            aria-label="Actualizar"
            title="Actualizar"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <a
            href={UMAMI_PANEL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-sm text-zinc-300 hover:bg-white/[0.07]"
          >
            Visitas en Umami <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </header>

      {userId ? (
        <UserDetail userId={userId} range={range} tick={tick} onClose={() => setUserId(null)} onRetry={refresh} />
      ) : (
        <>
          {error ? (
            <ErrorBanner message={data ? `${error}. Se muestran los últimos datos.` : `No se pudieron cargar las estadísticas: ${error}`} onRetry={refresh} />
          ) : null}
          {!data && status === "loading" ? <Skeleton /> : null}
          {data ? <Overview data={data} onUser={openUser} /> : null}
        </>
      )}
    </main>
  );
}
