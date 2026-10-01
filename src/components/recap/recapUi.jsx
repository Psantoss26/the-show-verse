"use client";

// Piezas visuales de "Tu año en The Show Verse": tipografía enorme, cifras que
// cuentan, pósters y formas decorativas. Ninguna usa backdrop-filter: las
// pantallas entran con opacidad y un cristal dentro se vería plano.

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

import { formatDecimal, formatNumber, tmdbImg } from "@/lib/recap/recapModel";
import styles from "./recap.module.css";

export const ANTON = { fontFamily: "var(--font-anton), var(--font-pt-sans), sans-serif" };
export const EASE_OUT = [0.22, 1, 0.36, 1];

/** Entrada básica: sube y aparece, con retraso. */
export function Reveal({ delay = 0, y = 26, className = "", children, as = "div", ...props }) {
  const reduce = useReducedMotion();
  const Component = motion[as] || motion.div;
  return (
    <Component
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.75, delay: reduce ? 0 : delay, ease: EASE_OUT }}
      className={className}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Titular que entra palabra a palabra desde detrás de una máscara, como en
 * Wrapped. El texto completo queda en el árbol accesible una sola vez.
 */
export function WordsReveal({ text, delay = 0, stagger = 0.07, className = "", style, as: Tag = "h2" }) {
  const reduce = useReducedMotion();
  const words = String(text || "").split(/\s+/).filter(Boolean);
  return (
    <Tag className={className} style={style} aria-label={text}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`} aria-hidden="true" className="-mt-[0.18em] inline-block overflow-hidden pb-[0.06em] pt-[0.18em] align-bottom">
          <motion.span
            className="inline-block"
            initial={reduce ? { opacity: 0 } : { y: "105%" }}
            animate={reduce ? { opacity: 1 } : { y: "0%" }}
            transition={{ duration: reduce ? 0.2 : 0.8, delay: reduce ? 0 : delay + index * stagger, ease: EASE_OUT }}
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

/** Cifra que cuenta desde 0 (ease-out exponencial). */
export function CountUp({ value, duration = 1.8, delay = 0.2, decimals = 0, className = "", style }) {
  const reduce = useReducedMotion();
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduce ? target : 0);
  const frame = useRef(0);

  useEffect(() => {
    if (reduce) {
      setShown(target);
      return undefined;
    }
    let start = 0;
    const tick = (now) => {
      if (!start) start = now + delay * 1000;
      const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      setShown(target * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, delay, reduce]);

  const text = decimals > 0 ? formatDecimal(shown, decimals) : formatNumber(shown);
  const final = decimals > 0 ? formatDecimal(target, decimals) : formatNumber(target);
  return (
    <span className={`tabular-nums ${className}`} style={style}>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

/** Rótulo pequeño sobre los titulares. */
export function Kicker({ children, color, className = "" }) {
  return (
    <Reveal delay={0.05} y={12} className={`flex items-center gap-2 text-[clamp(10px,3.1cqw,13px)] font-bold uppercase tracking-[0.22em] ${className}`}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: color || "currentColor" }} />
      <span>{children}</span>
    </Reveal>
  );
}

/** Tamaño de fuente para que un texto Anton quepa según su longitud. */
export function fitDisplaySize(text, { max = 22, min = 9, base = 7 } = {}) {
  const length = String(text || "").length || 1;
  return `${Math.max(min, Math.min(max, (base * 14) / Math.max(length, 4)))}cqw`;
}

export function Poster({ path, title, className = "", size = "w342", rounded = "rounded-[10px]", priority = false, style }) {
  const src = tmdbImg(path, size);
  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden bg-white/10 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.65)] ${rounded} ${className}`}
      style={style}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={title ? `Póster de ${title}` : ""}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-end bg-gradient-to-br from-white/25 to-white/5 p-2">
          <span className="line-clamp-3 text-[11px] font-bold leading-tight">{title}</span>
        </div>
      )}
    </div>
  );
}

export function PersonPhoto({ path, name, className = "" }) {
  const src = tmdbImg(path, "w185");
  const initials = String(name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
  return (
    <div className={`relative overflow-hidden rounded-full bg-white/15 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ? `Foto de ${name}` : ""} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">{initials}</span>
      )}
    </div>
  );
}

/** Fondo de película/serie a sangre con Ken Burns y degradado de lectura. */
export function BackdropFill({ path, fallbackPoster, tint = "#050505" }) {
  const src = tmdbImg(path, "w1280") || tmdbImg(fallbackPoster, "w780");
  if (!src) return null;
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className={`absolute inset-0 h-full w-full object-cover ${styles.kenBurns}`} draggable={false} />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${tint}cc 0%, ${tint}26 26%, ${tint}40 48%, ${tint}e6 72%, ${tint} 100%)`,
        }}
      />
    </div>
  );
}

export function Stars({ value, className = "" }) {
  const score = Number(value) || 0;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${className}`}>
      <Star aria-hidden="true" className="h-[1em] w-[1em] fill-current" />
      <span>{formatDecimal(score, score % 1 ? 1 : 0)}</span>
    </span>
  );
}

// ─────────────────────────────────────────────
// Formas decorativas (estilo Wrapped)
// ─────────────────────────────────────────────

function Burst({ color, className = "", points = 12 }) {
  const outer = 50;
  const inner = 30;
  const coords = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${50 + radius * Math.cos(angle)},${50 + radius * Math.sin(angle)}`);
  }
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon points={coords.join(" ")} fill={color} />
    </svg>
  );
}

function Ring({ color, className = "" }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10" strokeDasharray="16 10" />
    </svg>
  );
}

function Squiggle({ color, className = "" }) {
  return (
    <svg viewBox="0 0 200 60" className={className} aria-hidden="true">
      <path d="M5 30 Q 30 0 55 30 T 105 30 T 155 30 T 205 30" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
    </svg>
  );
}

function Blob({ color, className = "" }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <path
        fill={color}
        d="M43.5,-58.6C55.6,-49.8,64,-35.6,68.5,-20.3C73,-5,73.6,11.4,67.6,24.8C61.6,38.3,49,48.8,35.1,56.6C21.2,64.4,6,69.4,-9.8,70.2C-25.6,71,-42,67.6,-53.6,57.9C-65.2,48.2,-72,32.3,-73.5,16.2C-75,0.1,-71.3,-16.2,-63.2,-29.4C-55.1,-42.6,-42.6,-52.7,-29.1,-60.9C-15.6,-69.1,-1.1,-75.4,12.4,-73.4C25.9,-71.4,31.4,-67.4,43.5,-58.6Z"
        transform="translate(100 100)"
      />
    </svg>
  );
}

/** Capa de formas animadas detrás del contenido. `variant` cambia la composición. */
export function Shapes({ variant = 0, accent, accent2 }) {
  const layouts = [
    [
      ["burst", "-right-[14cqw] -top-[10cqw] w-[58cqw]", styles.spin, accent],
      ["ring", "-right-[28cqw] top-[42cqh] w-[40cqw]", styles.spinReverse, accent2],
    ],
    [
      ["blob", "-left-[20cqw] -top-[14cqw] w-[70cqw]", styles.floatSlow, accent],
      ["squiggle", "right-[-10cqw] bottom-[14cqh] w-[60cqw] rotate-[-14deg]", styles.float, accent2],
    ],
    [
      ["ring", "-right-[16cqw] top-[18cqh] w-[48cqw]", styles.spin, accent],
      ["burst", "-left-[12cqw] -bottom-[10cqw] w-[44cqw]", styles.spinReverse, accent2],
    ],
    [
      ["blob", "-right-[24cqw] -bottom-[18cqw] w-[78cqw]", styles.float, accent],
      ["burst", "left-[6cqw] top-[10cqh] w-[16cqw]", styles.spin, accent2],
    ],
    // Solo una forma arriba: para pantallas con texto a lo ancho.
    [["burst", "-right-[14cqw] -top-[10cqw] w-[58cqw]", styles.spin, accent]],
  ];
  const layout = layouts[variant % layouts.length];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {layout.map(([shape, position, animation, color], index) => {
        const Component = shape === "burst" ? Burst : shape === "ring" ? Ring : shape === "squiggle" ? Squiggle : Blob;
        return (
          <div key={index} className={`absolute ${position}`}>
            <div className={animation}>
              <Component color={color} className="h-auto w-full opacity-90" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Grain() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={styles.grain} />
    </div>
  );
}

export function Equalizer({ playing }) {
  return (
    <span aria-hidden="true" className={`${styles.eq} ${playing ? "" : styles.eqPaused}`}>
      <span />
      <span />
      <span />
    </span>
  );
}

export { styles as recapStyles };
