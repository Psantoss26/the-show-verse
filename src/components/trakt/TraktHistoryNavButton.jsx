"use client";

import Link from "next/link";
import { Eye, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { traktAuthStatus } from "@/lib/api/traktClient";

function isActivePath(pathname, href) {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (href !== "/" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

/**
 * variant:
 * - "icon"  -> (default) botón redondo como desktop
 * - "drawer"-> fila clicable para menú lateral móvil
 */
export default function TraktHistoryNavButton({
  className = "",
  variant = "icon",
  onClick,
  label = "Historial",
  iconSize = 20,
}) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const pathname = usePathname();

  const href = "/history";
  const active = useMemo(() => isActivePath(pathname, href), [pathname]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const st = await traktAuthStatus();
        if (!alive) return;
        setConnected(!!st?.connected && !st?.degraded);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const Icon = loading ? Loader2 : Eye;

  // ✅ Variante para navbar inferior móvil: misma clase exacta que navLinkClassMobileBottom
  if (variant === "mobile-bottom") {
    const textClass = active ? "text-emerald-400" : "text-neutral-400 hover:text-emerald-400";
    const mobileBottomClass =
      "relative group mx-1 my-2 flex h-12 flex-1 items-center justify-center rounded-full " +
      "transition-all duration-300 ease-out " +
      "hover:-translate-y-0.5 active:scale-95 focus:outline-none " +
      textClass;
    return (
      <Link
        href={href}
        onClick={onClick}
        className={mobileBottomClass}
        aria-label="Historial"
        prefetch={false}
      >
        {active && (
          <motion.div
            layoutId="activeTabMobileBottom"
            className="absolute inset-0 rounded-full bg-emerald-500/20 border border-emerald-500/30 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(16,185,129,0.15)]"
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
          />
        )}
        <span className="relative z-10 flex items-center justify-center">
          <Icon
            className={loading ? "animate-spin" : ""}
            width={iconSize}
            height={iconSize}
          />
        </span>
      </Link>
    );
  }

  // ✅ Mantiene EXACTO el estilo actual de escritorio pero con indicador deslizante animado
  if (variant === "icon") {
    const base =
      "relative group p-2 rounded-full transition-all duration-300 ease-out " +
      "hover:-translate-y-0.5 hover:scale-[1.05] active:scale-95 " +
      "focus:outline-none";

    const textClass = active
      ? "text-emerald-200"
      : "text-neutral-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:backdrop-blur-md hover:shadow-[0_4px_12px_rgba(16,185,129,0.15)]";

    return (
      <Link
        href={href}
        onClick={onClick}
        className={`${base} ${textClass} ${className}`}
        aria-label="Historial"
        prefetch={false}
      >
        {active && (
          <motion.div
            layoutId="activeTabDesktopIcon"
            className="absolute inset-0 rounded-full bg-emerald-500/20 border border-emerald-500/10 shadow-[inset_0_0.5px_1px_rgba(255,255,255,0.15),0_4px_10px_rgba(16,185,129,0.08)]"
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
          />
        )}
        <span className="relative z-10 flex items-center justify-center">
          <Icon
            className={`${loading ? "animate-spin " : ""}transition-transform duration-200 group-hover:scale-110`}
            width={iconSize}
            height={iconSize}
          />
        </span>
      </Link>
    );
  }

  // ✅ Variante para drawer móvil (fila completa clicable)
  const rowClass =
    `flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ` +
    (active ? "bg-white/10 text-white" : "text-neutral-300 hover:bg-white/5");

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`${rowClass} ${className}`}
      aria-label="Historial"
      prefetch={false}
    >
      <Icon
        className={`${loading ? "animate-spin" : ""}`}
        width={iconSize}
        height={iconSize}
      />
      <span>{label}</span>
    </Link>
  );
}
