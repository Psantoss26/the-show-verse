"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, MonitorPlay } from "lucide-react";

const SECTIONS = [
  { href: "/history", label: "Historial", Icon: History },
  { href: "/continue-watching", label: "Continuar viendo", Icon: MonitorPlay },
];

export default function HistorySectionNav({ className = "" }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Historial y continuar viendo"
      className={`inline-flex max-w-full gap-1 overflow-x-auto rounded-xl p-1 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {SECTIONS.map(({ href, label, Icon }) => {
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
            <Icon className="h-4 w-4 shrink-0" />
            {active && <span className="hidden lg:inline">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
