"use client";

// Selector de sección compartido por las tres vistas de "lo que estoy viendo":
// En progreso (/in-progress), Completadas (/completed) y Continuar viendo
// (/continue-watching). Son rutas hermanas; este control navega entre ellas y
// resalta la activa según la URL. Mismo estilo de "pastilla" que los antiguos
// tabs internos, para que la navegación se sienta igual en las tres páginas.
//
// En escritorio cada sección muestra su título (icono + texto), esté activa o
// no. En móvil son solo icono (incluida la activa), para que quepan en la misma
// fila que el buscador.

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlidingSectionIndicator } from "@/components/ui/useSlidingSectionIndicator";
import { Play, CheckCircle2 } from "lucide-react";

const SECTIONS = [
  { href: "/in-progress", label: "En progreso", Icon: Play, fillWhenActive: true },
  { href: "/completed", label: "Completadas", Icon: CheckCircle2, fillWhenActive: false },
];

// La pastilla de la activa se desliza: al pasar a la ruta hermana, el
// selector nuevo la recoge donde la dejó el anterior
// (useSlidingSectionIndicator).
const ACTIVE_PILL = "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20";

export default function WatchingSectionNav({ className = "" }) {
  const pathname = usePathname();
  const navRef = useRef(null);
  const { ready, indicator } = useSlidingSectionIndicator({
    navRef,
    activeKey: pathname,
    groupId: "watching-sections",
    className: ACTIVE_PILL,
  });
  return (
    <nav
      ref={navRef}
      aria-label="Secciones de seguimiento"
      className={`relative inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {indicator}
      {SECTIONS.map(({ href, label, Icon, fillWhenActive }) => {
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
            <Icon
              className="h-4 w-4 shrink-0"
              fill={active && fillWhenActive ? "currentColor" : "none"}
            />
            <span className="sv-page-toolbar-section-label hidden lg:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
