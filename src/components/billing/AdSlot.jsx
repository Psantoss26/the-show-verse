"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import useEntitlements from "@/hooks/useEntitlements";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
const ADS_PREVIEW = process.env.NEXT_PUBLIC_ADS_PREVIEW === "1";

let adsenseScript = null;

function loadAdsense() {
  if (adsenseScript || !ADSENSE_CLIENT) return;
  adsenseScript = document.createElement("script");
  adsenseScript.async = true;
  adsenseScript.crossOrigin = "anonymous";
  adsenseScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;
  document.head.appendChild(adsenseScript);
}

function AdsenseUnit({ slot }) {
  const pushed = useRef(false);
  useEffect(() => {
    loadAdsense();
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // El bloqueador de anuncios puede romper adsbygoogle: no es un error de la app.
    }
  }, []);
  return (
    <ins
      className="adsbygoogle block"
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

// Hueco de anuncio. Solo pinta algo si el plan lleva anuncios Y hay red
// configurada (NEXT_PUBLIC_ADSENSE_CLIENT + el `slot` de la unidad); con
// NEXT_PUBLIC_ADS_PREVIEW=1 pinta un marcador para maquetar. En cualquier otro
// caso no ocupa sitio.
export default function AdSlot({ slot = "", className = "" }) {
  const { ads, ready } = useEntitlements();
  if (!ready || !ads) return null;
  const live = Boolean(ADSENSE_CLIENT && slot);
  if (!live && !ADS_PREVIEW) return null;

  return (
    <aside aria-label="Publicidad" className={`mx-auto w-full max-w-5xl ${className}`}>
      <div className="mb-1.5 flex items-center justify-between px-1 text-[10px] uppercase tracking-widest text-zinc-600">
        <span>Publicidad</span>
        <Link href="/planes" className="font-bold text-zinc-500 hover:text-emerald-400">
          Quitar anuncios
        </Link>
      </div>
      {live ? (
        <AdsenseUnit slot={slot} />
      ) : (
        <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-xs text-zinc-600">
          Espacio publicitario
        </div>
      )}
    </aside>
  );
}
