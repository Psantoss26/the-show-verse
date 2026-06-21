"use client";

// Recharts-based charts for the Profile page, isolated in their own module so
// recharts (~heavy) is code-split out of the initial Profile bundle and only
// downloaded when the overview/patterns charts actually render. Each export is a
// self-contained chart that mirrors the markup previously inlined in StatsClient.

import { useEffect, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { COLORS, CHART_THEME } from "./chartConstants";

function CustomTooltip({ active, payload, label, formatter }) {
  if (active && payload && payload.length) {
    const title = label || (payload[0] && payload[0].name);
    return (
      <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-3 shadow-xl backdrop-blur-md z-50">
        <p className="font-bold text-white mb-2 text-sm">{title}</p>
        <div className="space-y-1">
          {payload.map((p, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span
                className="flex items-center gap-2"
                style={{ color: p.color }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.name}
              </span>
              <span className="font-mono font-bold text-zinc-300">
                {formatter ? formatter(p.value) : p.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

function ChartFrame({ className = "h-[300px]", children }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setReady(rect.width > 0 && rect.height > 0);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${className} min-w-0 w-full`}>
      {ready ? children : null}
    </div>
  );
}

function formatMinutes(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function formatGenreTick(value) {
  if (!value) return "";
  const mappings = {
    "Ciencia ficción": "C. Ficción",
    "Science Fiction": "Sci-Fi",
    "Ciencia ficción y Fantasía": "C. Ficc/Fant",
    "Science Fiction & Fantasy": "Sci-Fi/Fant",
    "Sci-Fi & Fantasy": "Sci-Fi/Fant",
    "Acción y aventura": "Acción/Aven.",
    "Action & Adventure": "Action/Adv.",
    "Película de TV": "Peli TV",
    "TV Movie": "TV Movie",
    "Documental": "Docu",
    "Documentary": "Docu",
  };
  return mappings[value] || value;
}

export function MonthlyActivityChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={data}
          margin={{ top: 10, right: 5, left: -28, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.indigo} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS.indigo} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={CHART_THEME.grid}
          />
          <XAxis
            dataKey="label"
            stroke={CHART_THEME.text}
            tick={{ fill: CHART_THEME.text, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          <YAxis
            stroke={CHART_THEME.text}
            tick={{ fill: CHART_THEME.text, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 2 }}
          />
          <Area
            type="monotone"
            dataKey="total"
            name="Total"
            stroke={COLORS.indigo}
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorTotal)"
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function TimeDistributionChart({ data, formattedTotalTime = "" }) {
  const parts = String(formattedTotalTime).split(" ");
  return (
    <ChartFrame className="relative h-[250px]">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <PieChart>
          <Pie
            data={data}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {(data || []).map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color}
                stroke="rgba(0,0,0,0)"
              />
            ))}
          </Pie>
          <Tooltip
            content={<CustomTooltip formatter={formatMinutes} />}
            wrapperStyle={{ zIndex: 1000 }}
          />
          <Legend verticalAlign="bottom" height={36} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
      {/* Center Text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
        <span className="text-3xl font-black text-white">{parts[0]}</span>
        <span className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
          {parts[1]}
        </span>
      </div>
    </ChartFrame>
  );
}

export function HourOfDayChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={CHART_THEME.grid}
          />
          <XAxis
            dataKey="name"
            stroke={CHART_THEME.text}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
          />
          <Bar dataKey="value" fill={COLORS.pink} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DayOfWeekChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={CHART_THEME.grid}
          />
          <XAxis
            dataKey="name"
            stroke={CHART_THEME.text}
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
          />
          <Bar dataKey="value" fill={COLORS.cyan} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function GenreRadarChart({ data, isMobile = false }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke={CHART_THEME.grid} />
          <PolarAngleAxis
            dataKey="name"
            tickFormatter={formatGenreTick}
            tick={{
              fill: CHART_THEME.text,
              fontSize: isMobile ? 11 : 14,
              fontWeight: 500,
            }}
          />
          <PolarRadiusAxis
            angle={30}
            domain={[0, "auto"]}
            tick={false}
            axisLine={false}
          />
          <Radar
            name="Géneros"
            dataKey="value"
            stroke={COLORS.lime}
            fill={COLORS.lime}
            fillOpacity={0.4}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RatingsBarChart({ data }) {
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart
          data={data}
          barSize={20}
          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={CHART_THEME.grid}
          />
          <XAxis
            dataKey="name"
            stroke={CHART_THEME.text}
            tick={{ fill: CHART_THEME.text, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(255,255,255,0.05)" }}
          />
          <Bar dataKey="value" name="Votos" radius={[4, 4, 0, 0]}>
            {(data || []).map((entry, index) => {
              const rating = Number(entry.name);
              return (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    rating >= 7.5
                      ? COLORS.teal
                      : rating >= 5
                        ? COLORS.yellow
                        : COLORS.rose
                  }
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
