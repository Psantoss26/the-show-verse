"use client";

// Gráficas de /admin, en su propio módulo para que recharts solo se descargue
// al abrir la página (ver AdminClient, next/dynamic).

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { COLORS, CHART_THEME } from "@/app/stats/chartConstants";
import { bucketLabel, formatCount } from "./adminFormat";

const tooltipStyle = {
  backgroundColor: "rgba(9,9,11,0.92)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
};

export function RequestsChart({ series, bucket }) {
  const data = (series || []).map((p) => ({
    ...p,
    label: bucketLabel(p.t, bucket),
    ok: Math.max(0, p.requests - p.errors4xx - p.errors5xx),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHART_THEME.text, fontSize: 11 }} minTickGap={28} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#fff" }} formatter={(v) => formatCount(v)} />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_THEME.text }} />
        <Area type="monotone" dataKey="ok" name="Correctas" stackId="1" stroke={COLORS.emerald} fill={COLORS.emerald} fillOpacity={0.25} />
        <Area type="monotone" dataKey="errors4xx" name="4xx" stackId="1" stroke={COLORS.yellow} fill={COLORS.yellow} fillOpacity={0.35} />
        <Area type="monotone" dataKey="errors5xx" name="5xx" stackId="1" stroke={COLORS.red} fill={COLORS.red} fillOpacity={0.45} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function UsersChart({ series, bucket }) {
  const data = (series || []).map((p) => ({ ...p, label: bucketLabel(p.t, bucket) }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={CHART_THEME.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: CHART_THEME.text, fontSize: 11 }} minTickGap={28} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: CHART_THEME.text, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#fff" }} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="users" name="Usuarios con sesión" fill={COLORS.blue} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
