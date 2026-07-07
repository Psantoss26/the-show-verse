"use client";

// Selector de sección compartido por las tres vistas de "lo que estoy viendo":
// En progreso (/in-progress), Completadas (/completed) y Continuar viendo
// (/continue-watching). Son rutas hermanas; este control navega entre ellas y
// resalta la activa según la URL. Mismo estilo de "pastilla" que los antiguos
// tabs internos, para que la navegación se sienta igual en las tres páginas.
//
// Compacto: SOLO la ruta activa muestra su etiqueta (icono + texto); las otras
// dos quedan como icono suelto (estilo de la vista móvil), en cualquier tamaño.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Play, CheckCircle2, MonitorPlay } from "lucide-react";

const SECTIONS = [
  { href: "/in-progress", label: "En progreso", Icon: Play, fillWhenActive: true },
  { href: "/completed", label: "Completadas", Icon: CheckCircle2, fillWhenActive: false },
  { href: "/continue-watching", label: "Continuar viendo", Icon: MonitorPlay, fillWhenActive: false },
];

export default function WatchingSectionNav({ className = "" }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones de seguimiento"
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {SECTIONS.map(({ href, label, Icon, fillWhenActive }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            aria-label={label}
            title={label}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg py-2 text-sm font-bold transition-all ${
              active ? "px-2.5 lg:px-3.5" : "px-2.5"
            } ${
              active
                ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/20"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon
              className="h-4 w-4 shrink-0"
              fill={active && fillWhenActive ? "currentColor" : "none"}
            />
            {active && <span>{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
