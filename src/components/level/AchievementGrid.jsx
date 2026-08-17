// src/components/level/AchievementGrid.jsx
// Rejilla de logros, agrupada por familia.
//
// Un logro pendiente no se esconde: enseña su avance real, porque saber que te
// faltan 12 episodios es lo que hace que el siguiente se persiga. El avance va
// como una línea al pie de la tarjeta, no como otra barra más, para que la
// rejilla siga leyéndose como una colección y no como un panel de progreso.

import {
  Award, Calendar, CheckCircle2, Clapperboard, Crown, Film, Flame, Heart, Infinity as InfinityIcon,
  Library, List, Lock, Moon, PenLine, Projector, ScrollText, Shield, Sparkles, Star, ThumbsUp,
  Ticket, Tv, UserCheck, UserPlus, Users, Zap,
} from "lucide-react";

import {
  ACHIEVEMENT_FAMILY_LABELS,
  formatXp,
  rarityVisual,
} from "@/lib/level/tiers.mjs";

// Los iconos los nombra el catálogo del backend (level/achievements.js).
const ICONS = {
  ticket: Ticket, film: Film, clapperboard: Clapperboard, projector: Projector,
  tv: Tv, infinity: InfinityIcon, "check-circle": CheckCircle2, library: Library,
  star: Star, award: Award, pen: PenLine, scroll: ScrollText,
  heart: Heart, list: List, sparkles: Sparkles,
  "user-plus": UserPlus, users: Users, "user-check": UserCheck, "thumbs-up": ThumbsUp,
  flame: Flame, calendar: Calendar,
  zap: Zap, moon: Moon, shield: Shield, crown: Crown,
};

const FAMILY_ORDER = Object.keys(ACHIEVEMENT_FAMILY_LABELS);

function unlockedDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

function AchievementCard({ achievement }) {
  const Icon = ICONS[achievement.icon] || Award;
  const rarity = rarityVisual(achievement.rarity);
  const unlocked = Boolean(achievement.unlocked);
  const date = unlockedDate(achievement.unlockedAt);
  const percent = Math.max(0, Math.min(100, Number(achievement.progress?.percent) || 0));

  return (
    <li
      className={`relative flex flex-col overflow-hidden rounded-2xl p-3.5 ring-1 transition duration-300 ${
        unlocked
          ? `bg-gradient-to-br from-white/[0.09] to-white/[0.03] ${rarity.ring} hover:-translate-y-0.5`
          : "bg-white/[0.02] ring-white/[0.06]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            unlocked ? `bg-white/[0.07] ${rarity.accent}` : "bg-white/[0.03] text-zinc-600"
          }`}
        >
          {unlocked ? (
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <Lock className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-black tracking-tight ${unlocked ? "text-white" : "text-zinc-400"}`}>
            {achievement.name}
          </p>
          <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-widest ${unlocked ? rarity.accent : "text-zinc-600"}`}>
            {rarity.label}
          </p>
        </div>
      </div>

      <p className={`mt-2 text-xs leading-snug ${unlocked ? "text-zinc-400" : "text-zinc-500"}`}>
        {achievement.description}
      </p>

      <div className="mt-auto pt-2.5">
        {unlocked ? (
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            {date ? `Conseguido el ${date}` : "Conseguido"}
          </p>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest tabular-nums text-zinc-500">
              {formatXp(achievement.progress?.current)} / {formatXp(achievement.progress?.threshold)}
            </p>
            <div className="mt-1 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-zinc-500" style={{ width: `${percent}%` }} />
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export default function AchievementGrid({ achievements }) {
  const items = Array.isArray(achievements?.items) ? achievements.items : [];
  if (!items.length) return null;

  const byFamily = new Map();
  for (const item of items) {
    if (!byFamily.has(item.family)) byFamily.set(item.family, []);
    byFamily.get(item.family).push(item);
  }
  const families = FAMILY_ORDER.filter((family) => byFamily.has(family));

  return (
    <div className="space-y-7">
      {families.map((family) => {
        const group = byFamily.get(family);
        const unlocked = group.filter((item) => item.unlocked).length;
        return (
          <section key={family}>
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                {ACHIEVEMENT_FAMILY_LABELS[family]}
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-widest tabular-nums text-zinc-500">
                {unlocked} / {group.length}
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {group.map((item) => (
                <AchievementCard key={item.id} achievement={item} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
