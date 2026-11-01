"use client";

// src/app/social/SocialHub.jsx
//
// SECCIÓN SOCIAL: fondo, cabecera con las cifras y, debajo, la barra con el
// selector Hoy / Siguiendo / Yo y su contenido (SocialClient). Antes Hoy era
// otra página (/today) con su propia cabecera y entradas de menú; ahora es una
// opción más de esa barra y lleva sus filtros en el mismo menú.

import { useCallback, useEffect, useState } from "react";
import LoginRequiredScreen from "@/components/auth/LoginRequiredScreen";
import { Activity, CalendarDays, Clapperboard, Flame, Users } from "lucide-react";
import { motion } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import PageStatCard from "@/components/ui/PageStatCard";
import { useIsHistoryNavigation } from "@/lib/hooks/useIsHistoryNavigation";
import { summarize } from "@/lib/today/stories";
import { fetchTodayFeed } from "@/lib/today/todayFeedClient";
import SocialClient from "./SocialClient";

// Tarjeta de cifra de la cabecera: la compartida de todas las cabeceras
// (`PageStatCard`, mini tarjeta en móvil), como `CountStat` en Perfil, con el
// mismo enlace a las listas de seguidores/seguidos. Como en Listas, se queda
// montada al cambiar de sección y solo se relevan, animados, sus piezas
// (`animateChanges`, `swapGroup` = la sección).
function TarjetaCifra({ value, label, shortLabel, href, title, icon, iconClassName = "text-pink-400", seccion, index }) {
  // Mientras no ha llegado el resumen se muestra un guion, no un 0: un cero
  // es una cifra real y sería mentira.
  return (
    <PageStatCard
      value={typeof value === "number" ? value : "—"}
      label={label}
      shortLabel={shortLabel}
      href={href}
      prefetch={false}
      title={title}
      icon={icon}
      colorClass={iconClassName}
      focusRingClass="focus-visible:ring-pink-400/70"
      animateChanges
      iconKey={label}
      swapGroup={seccion}
      swapIndex={index}
    />
  );
}

// Sección de la barra según ?view= (como ALCANCE_DE_VISTA en SocialClient).
const SECCION_DE_VISTA = { activity: "following", mine: "me" };

// Las tres tarjetas de cada sección: no se cuenta lo mismo en Actividad, en
// Siguiendo y en Yo.
//  - Actividad: actividades y personas de la ventana elegida en Quién y Día
//    (las manda TodayClient) y cuántas cuentas que sigues se han movido esta
//    semana (dice si va a haber algo nuevo que enseñar).
//  - Siguiendo: lo que han hecho las cuentas que sigues en la semana, cuántas
//    sigues y cuántas se han movido.
//  - Yo: lo que has hecho en la semana, en cuántos títulos y cuántos días.
// Siguiendo y Yo salen de /api/users/feed/summary (`sections`), no del feed
// cargado, que va paginado.
function tarjetasDeSeccion(seccion, { todaySummary, summary }) {
  const dias = summary?.windowDays || 7;
  const activos = {
    value: summary?.activeWeek,
    label: "Activos",
    icon: Activity,
    iconClassName: "text-rose-400",
    title: `Cuentas que sigues con actividad en los últimos ${dias} días`,
  };
  if (seccion === "following") {
    const datos = summary?.sections?.following;
    return [
      {
        value: datos?.actions,
        label: "Actividades",
        icon: Flame,
        iconClassName: "text-pink-400",
        title: `Lo que han hecho las cuentas que sigues en los últimos ${dias} días`,
      },
      {
        value: datos?.people,
        label: "Personas",
        icon: Users,
        iconClassName: "text-fuchsia-400",
        title: "Cuentas que sigues",
      },
      { ...activos, value: datos?.active },
    ];
  }
  if (seccion === "me") {
    const datos = summary?.sections?.me;
    return [
      {
        value: datos?.actions,
        label: "Actividades",
        icon: Flame,
        iconClassName: "text-pink-400",
        title: `Lo que has hecho en los últimos ${dias} días`,
      },
      {
        value: datos?.titles,
        label: "Títulos",
        icon: Clapperboard,
        iconClassName: "text-fuchsia-400",
        title: `Títulos distintos con actividad tuya en los últimos ${dias} días`,
      },
      {
        value: datos?.days,
        label: "Días activos",
        shortLabel: "Días",
        icon: CalendarDays,
        iconClassName: "text-rose-400",
        title: `Días con actividad tuya de los últimos ${dias}`,
      },
    ];
  }
  return [
    {
      value: todaySummary?.actions,
      label: "Actividades",
      icon: Flame,
      iconClassName: "text-pink-400",
      title: "Actividades en Actividad, con lo elegido en Quién y Día",
    },
    {
      value: todaySummary?.people,
      label: "Personas",
      icon: Users,
      iconClassName: "text-fuchsia-400",
      title: "Personas que salen en Actividad, con lo elegido en Quién y Día",
    },
    activos,
  ];
}

export default function SocialHub({ initialView, initialToday }) {
  const { session, account, hydrated } = useAuth();

  // Entrada de las tarjetas igual que en Listas (bloque que sube y tarjetas
  // escalonadas), solo al llegar a la página, con cualquier sección. Al volver
  // atrás se quedan quietas.
  const isBackNav = useIsHistoryNavigation();
  const [statsEntry] = useState(() => !isBackNav);
  // Sección elegida en la barra (Actividad · Siguiendo · Yo): elige las
  // cifras y el relevo. Empieza en la de llegada (la misma cuenta que hace
  // SocialClient) y SocialClient solo avisa al CAMBIAR.
  const [seccion, setSeccion] = useState(() => SECCION_DE_VISTA[initialView] || "today");

  // Cifras de Siguiendo y Yo (y «Activos» de Actividad): se piden una sola
  // vez y traen las de las dos secciones.
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

  // Actividades y personas de Hoy (con lo elegido en Quién y Día): las manda
  // TodayClient al cargar cada ventana. Hasta entonces, las del RSC o, si se
  // entró por Siguiendo o Yo, las de la petición compartida de Hoy.
  const [todaySummary, setTodaySummary] = useState(() =>
    initialToday?.data ? summarize(initialToday.data.actions || []) : null,
  );
  const handleTodaySummary = useCallback((next) => setTodaySummary(next), []);
  useEffect(() => {
    if (!session || !account?.id || todaySummary) return undefined;
    let vigente = true;
    fetchTodayFeed(initialToday?.scope || "following", initialToday?.day || "today")
      .then((json) => {
        if (vigente) setTodaySummary((prev) => prev || summarize(json.actions || []));
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
    // Solo al entrar: después lo mantiene TodayClient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, account?.id]);

  if (!hydrated) return <div className="min-h-screen bg-black" />;

  if (!session || !account?.id) {
    return (
      <LoginRequiredScreen
        theme="pink"
        eyebrow="COMUNIDAD"
        title="Social"
        description="Lo destacado de hoy y la actividad de la gente a la que sigues, y la tuya."
        message="Inicia sesión para ver qué está viendo hoy la gente a la que sigues."
        next="/social"
      />
    );
  }

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
              <p className="mt-2 hidden whitespace-nowrap text-lg text-zinc-400 md:block">
                Lo destacado de hoy y la actividad de la gente a la que sigues, y la tuya.
              </p>
            </div>

            <motion.div
              className="grid w-full grid-cols-3 gap-2 sm:gap-3 lg:w-auto"
              initial={statsEntry ? { opacity: 0, y: 20 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              {/* Tres cifras por sección (`tarjetasDeSeccion`). La clave es
                  la posición: al cambiar de sección no se remontan, se relevan. */}
              {tarjetasDeSeccion(seccion, { todaySummary, summary }).map((card, index) => (
                <motion.div
                  key={index}
                  className="flex min-w-0"
                  initial={statsEntry ? { opacity: 0, scale: 0.9 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.5 + index * 0.1 }}
                >
                  <TarjetaCifra {...card} seccion={seccion} index={index} />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </header>

        <SocialClient initialView={initialView} initialToday={initialToday} onTodaySummary={handleTodaySummary} onScopeChange={setSeccion} />
      </div>
    </div>
  );
}
