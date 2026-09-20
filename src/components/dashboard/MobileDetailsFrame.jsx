"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import {
  canonicalDetailsHref,
  EMBEDDED_DETAILS_MESSAGE,
  EMBEDDED_DETAILS_PREFIX,
} from "@/lib/navigation/embeddedDetails";

export default function MobileDetailsFrame({ href, title, onClose }) {
  const frameRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== EMBEDDED_DETAILS_MESSAGE) return;
      if (event.data.action === "close") onClose();
      if (event.data.action === "list-changed") {
        window.dispatchEvent(new CustomEvent("showverse:list-changed", { detail: event.data.detail || {} }));
      }
      if (event.data.action === "navigate" && typeof event.data.href === "string") {
        const target = canonicalDetailsHref(event.data.href, window.location.origin);
        if (target.origin === window.location.origin) router.push(target.pathname + target.search + target.hash);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onClose, router]);

  const onLoad = () => {
    // También recoge las redirecciones completas (por ejemplo, iniciar sesión).
    try {
      const location = frameRef.current.contentWindow.location;
      if (location.origin !== window.location.origin || location.pathname.startsWith(EMBEDDED_DETAILS_PREFIX)) return;
      const target = canonicalDetailsHref(location.href, window.location.origin);
      router.replace(target.pathname + target.search + target.hash);
    } catch {
      // Un destino externo nunca se inspecciona ni se ejecuta en la página padre.
    }
  };

  return (
    <iframe
      ref={frameRef}
      title={`Ficha móvil: ${title || "Detalles"}`}
      src={href.replace("/details/", EMBEDDED_DETAILS_PREFIX)}
      onLoad={onLoad}
      className="h-full w-full border-0 bg-[#101010]"
      allow="fullscreen; clipboard-write; web-share"
    />
  );
}
