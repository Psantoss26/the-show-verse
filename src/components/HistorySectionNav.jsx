"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlidingSectionIndicator } from "@/components/ui/useSlidingSectionIndicator";
import { History, MonitorPlay } from "lucide-react";

const SECTIONS = [
  { href: "/history", label: "Historial", Icon: History },
  { href: "/continue-watching", label: "Continuar viendo", Icon: MonitorPlay },
];

// La pastilla de la activa se desliza: al pasar a la ruta hermana, el
// selector nuevo la recoge donde la dejó el anterior
// (useSlidingSectionIndicator).
const ACTIVE_PILL = "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20";

export default function HistorySectionNav({ className = "" }) {
  const pathname = usePathname();
  const navRef = useRef(null);
  const { ready, indicator } = useSlidingSectionIndicator({
    navRef,
    activeKey: pathname,
    groupId: "history-sections",
    className: ACTIVE_PILL,
  });

  return (
    <nav
      ref={navRef}
      aria-label="Historial y continuar viendo"
      className={`relative inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {indicator}
      {SECTIONS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            data-section-key={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            className={`relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-bold transition-all lg:px-3.5 ${
              active
                ? `text-white ${ready ? "" : ACTIVE_PILL}`
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {/* Cada sección muestra su título en escritorio, no solo la activa.
                `sv-page-toolbar-section-label`: el `lg:` mira el VIEWPORT, y en
                una página estrechada por el drawer la barra se quedaba sin
                sitio. Los filtros ceden antes; el título solo se retira como
                último recurso (globals.css). */}
            <span className="sv-page-toolbar-section-label hidden lg:inline">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
