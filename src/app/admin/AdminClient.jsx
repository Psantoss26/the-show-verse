"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import {
  RANGES,
  countryFlag,
  countryName,
  formatCount,
  formatMs,
  formatPercent,
  statusTone,
  timeAgo,
} from "./adminFormat";

// Estadísticas del administrador: peticiones al backend (request_log, ver
// backend/src/routes/admin.js) y enlace al panel de Umami para las visitas.

const chartFallback = () => <div className="h-[260px] animate-pulse rounded-xl bg-white/[0.03]" />;
const RequestsChart = dynamic(() => import("./adminCharts").then((m) => m.RequestsChart), { ssr: false, loading: chartFallback });
const UsersChart = dynamic(() => import("./adminCharts").then((m) => m.UsersChart), { ssr: false, loading: chartFallback });

const UMAMI_PANEL_URL = "https://stats.theshowverse.com";

async function getJson(url, signal) {
  const res = await fetch(url, { cache: "no-store", credentials: "include", signal });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

function Card({ title, children, className = "" }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-white/[0.06] bg-zinc-950/70 p-4 ${className}`}>
      {title ? <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">{title}</h2> : null}
      {children}
    </section>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/70 px-4 py-3">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function Totals({ totals }) {
  const t = totals || {};
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi label="Peticiones" value={formatCount(t.requests)} hint={`${formatCount(t.anonymous)} sin sesión`} />
      <Kpi label="Usuarios con sesión" value={formatCount(t.users)} hint={`${formatCount(t.ips)} redes (IP /24)`} />
      <Kpi
        label="Errores"
        value={formatPercent((t.errors4xx || 0) + (t.errors5xx || 0), t.requests)}
        hint={`${formatCount(t.errors5xx)} 5xx · ${formatCount(t.errors4xx)} 4xx`}
      />
      <Kpi label="Tiempo de respuesta" value={formatMs(t.p50Ms)} hint={`p95 ${formatMs(t.p95Ms)}`} />
    </div>
  );
}

function RouteTable({ rows, empty = "Sin datos" }) {
  if (!rows?.length) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="pb-2 font-normal">Ruta</th>
            <th className="pb-2 text-right font-normal">Peticiones</th>
            <th className="pb-2 text-right font-normal">Media</th>
            <th className="pb-2 text-right font-normal">p95</th>
            <th className="pb-2 text-right font-normal">4xx / 5xx</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((r) => (
            <tr key={`${r.method} ${r.route}`}>
              <td className="max-w-[22rem] truncate py-1.5 pr-3 font-mono text-xs text-zinc-200" title={r.route}>
                <span className="mr-1.5 text-zinc-500">{r.method}</span>
                {r.route}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatCount(r.count)}</td>
              <td className="py-1.5 text-right tabular-nums text-zinc-400">{formatMs(r.avgMs)}</td>
              <td className="py-1.5 text-right tabular-nums text-zinc-400">{formatMs(r.p95Ms)}</td>
              <td className="py-1.5 text-right tabular-nums">
                <span className={r.errors4xx ? "text-amber-300" : "text-zinc-600"}>{r.errors4xx}</span>
                <span className="text-zinc-600"> / </span>
                <span className={r.errors5xx ? "text-red-400" : "text-zinc-600"}>{r.errors5xx}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Shares({ rows, total, render }) {
  if (!rows?.length) return <p className="text-sm text-zinc-500">Sin datos</p>;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((row, i) => (
        <li key={i} className="relative overflow-hidden rounded-lg px-2.5 py-1.5 text-sm">
          <div className="absolute inset-y-0 left-0 bg-white/[0.05]" style={{ width: `${(row.count / max) * 100}%` }} />
          <div className="relative flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">{render(row)}</span>
            <span className="shrink-0 tabular-nums text-zinc-400">
              {formatCount(row.count)} <span className="text-zinc-600">· {formatPercent(row.count, total)}</span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Recent({ rows, onUser }) {
  if (!rows?.length) return <p className="text-sm text-zinc-500">Sin peticiones todavía</p>;
  return (
    <div className="max-h-[28rem] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-zinc-950 text-left text-zinc-500">
          <tr>
            <th className="pb-2 font-normal">Cuándo</th>
            <th className="pb-2 font-normal">Quién</th>
            <th className="pb-2 font-normal">Petición</th>
            <th className="pb-2 text-right font-normal">Estado</th>
            <th className="pb-2 text-right font-normal">Tiempo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {rows.map((r, i) => (
            <tr key={`${r.ts}-${i}`} title={r.userAgent || ""}>
              <td className="whitespace-nowrap py-1.5 pr-3 text-zinc-400" title={new Date(r.ts).toLocaleString("es-ES")}>
                {timeAgo(r.ts)}
              </td>
              <td className="whitespace-nowrap py-1.5 pr-3">
                {r.userId ? (
                  <button type="button" onClick={() => onUser?.(r.userId)} className="text-sky-300 hover:underline">
                    {r.username || r.userId.slice(0, 8)}
                  </button>
                ) : (
                  <span className="text-zinc-500">anónimo</span>
                )}
                <span className="ml-1.5" title={`${countryName(r.country)} · ${r.ip || "sin IP"}`}>
                  {countryFlag(r.country)}
                </span>
              </td>
              <td className="max-w-[24rem] truncate py-1.5 pr-3 font-mono text-zinc-200" title={r.route}>
                <span className="mr-1.5 text-zinc-500">{r.method}</span>
                {r.route}
              </td>
              <td className={`py-1.5 text-right tabular-nums ${statusTone(r.status)}`}>{r.status}</td>
              <td className="py-1.5 text-right tabular-nums text-zinc-400">{formatMs(r.durationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopUsers({ rows, onUser }) {
  if (!rows?.length) return <p className="text-sm text-zinc-500">Nadie con sesión en este periodo</p>;
  return (
    <ul className="divide-y divide-white/[0.04]">
      {rows.map((u) => (
        <li key={u.userId}>
          <button
            type="button"
            onClick={() => onUser(u.userId)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left hover:bg-white/[0.04]"
          >
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                {(u.displayName || u.username || "?").slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-white">{u.displayName || u.username}</span>
              <span className="block truncate text-xs text-zinc-500">
                @{u.username} · {timeAgo(u.lastSeen)} · {u.ips} {u.ips === 1 ? "red" : "redes"}
              </span>
            </span>
            <span className="shrink-0 text-right text-sm tabular-nums">
              {formatCount(u.count)}
              {u.errors ? <span className="block text-xs text-amber-300">{formatCount(u.errors)} errores</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Breakdowns({ data }) {
  const total = data?.totals?.requests || 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Países">
        <Shares rows={data?.countries} total={total} render={(r) => `${countryFlag(r.country)} ${countryName(r.country)}`} />
      </Card>
      <Card title="Clientes">
        <Shares rows={data?.clients} total={total} render={(r) => r.kind} />
      </Card>
      <Card title="Códigos de respuesta">
        <Shares rows={data?.statusCodes} total={total} render={(r) => <span className={statusTone(r.status)}>{r.status}</span>} />
      </Card>
    </div>
  );
}

function UserDetail({ userId, range, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    getJson(`/api/admin/stats/users/${encodeURIComponent(userId)}?range=${range}`, ctrl.signal)
      .then(({ ok, body }) => setState({ loading: false, data: ok ? body : null, error: ok ? null : body?.message || "Error" }))
      .catch((error) => {
        if (error?.name !== "AbortError") setState({ loading: false, data: null, error: "Sin conexión" });
      });
    return () => ctrl.abort();
  }, [userId, range]);

  const { data, loading, error } = state;
  const user = data?.user;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClose} className="rounded-full bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/10">
          ← Todos
        </button>
        {user ? (
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-white">{user.displayName || user.username}</div>
            <div className="text-xs text-zinc-500">
              <Link href={`/u/${user.username}`} className="hover:underline">@{user.username}</Link>
              {user.createdAt ? ` · cuenta desde ${new Date(user.createdAt).toLocaleDateString("es-ES")}` : ""}
              {user.lastSeen ? ` · última petición ${timeAgo(user.lastSeen)}` : " · sin peticiones registradas"}
            </div>
          </div>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading && !data ? <div className="h-40 animate-pulse rounded-2xl bg-white/[0.03]" /> : null}
      {data ? (
        <>
          <Totals totals={data.totals} />
          <Card title="Actividad">
            <RequestsChart series={data.series} bucket={data.bucket} />
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Lo que más pide">
              <RouteTable rows={data.topRoutes} />
            </Card>
            <Card title="Errores">
              <RouteTable rows={data.errorRoutes} empty="Sin errores" />
            </Card>
          </div>
          <Breakdowns data={data} />
          <Card title="Últimas peticiones">
            <Recent rows={data.recent} />
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function AdminClient() {
  const { authenticated, hydrated } = useAuth();
  const [range, setRange] = useState("24h");
  const [userId, setUserId] = useState(null);
  const [state, setState] = useState({ status: "loading", data: null });
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!hydrated) return undefined;
    if (!authenticated) {
      setState({ status: "anonymous", data: null });
      return undefined;
    }
    const ctrl = new AbortController();
    getJson(`/api/admin/stats?range=${range}`, ctrl.signal)
      .then(({ status, ok, body }) => {
        if (ok) setState({ status: "ready", data: body });
        else if (status === 401) setState({ status: "anonymous", data: null });
        else if (status === 403) setState({ status: "forbidden", data: null });
        else setState((s) => ({ status: s.data ? "ready" : "error", data: s.data, error: body?.message }));
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setState((s) => ({ status: s.data ? "ready" : "error", data: s.data }));
      });
    return () => ctrl.abort();
  }, [authenticated, hydrated, range, tick]);

  // Al día sin recargar: cada minuto mientras la pestaña está a la vista.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 60000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const { status, data } = state;

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
    <main className="mx-auto max-w-7xl space-y-4 px-4 pb-12 pt-24 text-zinc-100 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Estadísticas</h1>
          <p className="text-sm text-zinc-500">
            Peticiones al backend
            {data?.generatedAt ? ` · actualizado ${new Date(data.generatedAt).toLocaleTimeString("es-ES")}` : ""}
            {" · "}
            <a href={UMAMI_PANEL_URL} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
              Visitas en Umami ↗
            </a>
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.05] p-1" role="tablist" aria-label="Periodo">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${range === r.key ? "bg-white text-black" : "text-zinc-300 hover:bg-white/10"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {status === "error" ? <p className="text-sm text-red-400">No se pudieron cargar las estadísticas.</p> : null}
      {status === "loading" ? <div className="h-64 animate-pulse rounded-2xl bg-white/[0.03]" /> : null}

      {userId ? (
        <UserDetail userId={userId} range={range} onClose={() => setUserId(null)} />
      ) : data ? (
        <>
          <Totals totals={data.totals} />
          <Card title="Peticiones">
            <RequestsChart series={data.series} bucket={data.bucket} />
          </Card>
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card title="Usuarios activos">
              <UsersChart series={data.series} bucket={data.bucket} />
            </Card>
            <Card title="Quién usa más la web">
              <TopUsers rows={data.topUsers} onUser={setUserId} />
            </Card>
          </div>
          <Breakdowns data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Rutas más pedidas">
              <RouteTable rows={data.topRoutes} />
            </Card>
            <Card title="Rutas más lentas (p95, mín. 5 peticiones)">
              <RouteTable rows={data.slowRoutes} />
            </Card>
          </div>
          <Card title="Rutas con errores">
            <RouteTable rows={data.errorRoutes} empty="Sin errores en este periodo" />
          </Card>
          <Card title="Últimas peticiones">
            <Recent rows={data.recent} onUser={setUserId} />
          </Card>
        </>
      ) : null}
    </main>
  );
}
