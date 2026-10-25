"use client";

// src/app/social/SocialHub.jsx
//
// SECCIÓN SOCIAL: fondo, cabecera con las cifras y, debajo, la barra con el
// selector Hoy / Siguiendo / Yo y su contenido (SocialClient). Antes Hoy era
// otra página (/today) con su propia cabecera y entradas de menú; ahora es una
// opción más de esa barra y lleva sus filtros en el mismo menú.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, UserRoundCheck, Users } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import PageStatCard from "@/components/ui/PageStatCard";
import SocialClient from "./SocialClient";

// Tarjeta de cifra de la cabecera: la compartida de todas las cabeceras
// (`PageStatCard`, mini tarjeta en móvil), como `CountStat` en Perfil, con el
// mismo enlace a las listas de seguidores/seguidos.
function TarjetaCifra({ value, label, href, title, icon, iconClassName = "text-pink-400" }) {
  // Mientras no ha llegado el resumen se muestra un guion, no un 0: un cero
  // es una cifra real y sería mentira.
  return (
    <PageStatCard
      value={typeof value === "number" ? value : "—"}
      label={label}
      href={href}
      prefetch={false}
      title={title}
      icon={icon}
      colorClass={iconClassName}
      focusRingClass="focus-visible:ring-pink-400/70"
    />
  );
}

export default function SocialHub({ initialView, initialToday }) {
  const { session, account, hydrated } = useAuth();

  // Cifras de la cabecera: no cambian al pasar de vista, así que se piden una
  // sola vez.
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!session || !account?.id) return undefined;
    let vigente = true;
    (async () => {
      try {
        const res = await fetch("/api/users/feed/summary", { credentials: "include", cache: "no-store" });
        if (!res.ok) return; // Un fallo conserva las cifras previas, no las pone a cero.
        const json = await res.json().catch(() => null);
        if (vigente && json?.summary) setSummary(json.summary);
      } catch {
        /* la cabecera se queda con lo que ya tuviera */
      }
    })();
    return () => {
      vigente = false;
    };
  }, [session, account?.id]);

  if (!hydrated) return <div className="min-h-screen bg-black" />;

  if (!session || !account?.id) {
    return (
      <div className="min-h-screen bg-black font-sans text-zinc-100">
        <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tighter text-white">
            Social<span className="text-pink-500">.</span>
          </h1>
          <p className="mt-3 text-zinc-400">
            Inicia sesión para ver qué está viendo hoy la gente a la que sigues.
          </p>
          <Link
            href="/login?next=/social"
            className="mt-6 inline-block rounded-2xl bg-gradient-to-br from-pink-500 to-fuchsia-600 px-6 py-3 text-sm font-bold text-white shadow-lg"
          >
            INICIAR SESIÓN
          </Link>
        </div>
      </div>
    );
  }

  const perfilHref = account?.username ? `/u/${encodeURIComponent(account.username)}` : null;

  return (
    <div className="min-h-screen bg-black font-sans text-zinc-100 selection:bg-pink-500/30">
      {/* Manchas de color de la sección, igual que en las demás páginas */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -left-[5%] -top-[10%] aspect-square w-[60vw] max-w-[800px] rounded-full bg-pink-600/15 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -right-[5%] top-[15%] aspect-square w-[55vw] max-w-[700px] rounded-full bg-fuchsia-700/20 blur-[120px] sm:blur-[150px]" />
        <div className="absolute -bottom-[10%] left-[15%] aspect-square w-[65vw] max-w-[800px] rounded-full bg-pink-800/25 blur-[120px] sm:blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="mb-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="h-px w-12 bg-pink-500" />
                <span className="text-xs font-bold uppercase tracking-widest text-pink-400">COMUNIDAD</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tighter text-white md:text-6xl">
                Social<span className="text-pink-500">.</span>
              </h1>
              <p className="mt-2 hidden max-w-lg text-lg text-zinc-400 md:block">
                Lo destacado de hoy y la actividad de la gente a la que sigues, y la tuya.
              </p>
            </div>

            <div className="grid w-full grid-cols-3 gap-2 sm:gap-3 lg:w-auto">
              <TarjetaCifra
                value={summary?.following}
                label="Siguiendo"
                icon={UserRoundCheck}
                iconClassName="text-pink-400"
                href={perfilHref ? `${perfilHref}/following` : undefined}
              />
              <TarjetaCifra
                value={summary?.followers}
                label="Seguidores"
                icon={Users}
                iconClassName="text-fuchsia-400"
                href={perfilHref ? `${perfilHref}/followers` : undefined}
              />
              {/* De toda la gente a la que sigues, cuánta se ha movido esta
                  semana: dice si va a haber algo nuevo que enseñar. */}
              <TarjetaCifra
                value={summary?.activeWeek}
                label="Activos"
                icon={Activity}
                iconClassName="text-rose-400"
                title={`Cuentas que sigues con actividad en los últimos ${summary?.windowDays || 7} días`}
              />
            </div>
          </div>
        </header>

        <SocialClient initialView={initialView} initialToday={initialToday} />
      </div>
    </div>
  );
}
