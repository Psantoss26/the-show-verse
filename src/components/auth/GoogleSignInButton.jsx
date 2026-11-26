"use client";

// Botón OFICIAL de «Continuar con Google» (Google Identity Services).
//
// Lo pinta Google dentro de su propio iframe: diseño, texto y logotipo son los
// suyos, y al pulsarlo se abre la ventana de Google para elegir cuenta sin salir
// de la página. Devuelve un idToken por `onCredential`.
//
// Mientras carga el script se reserva su hueco (sin salto). Si no carga —sin
// red, bloqueador, origen no autorizado en Google Cloud— se enseña un enlace
// equivalente que hace el login por redirección.

import { useEffect, useRef, useState } from "react";

import {
  googleButtonOptions,
  loadGoogleIdentityScript,
} from "@/lib/auth/googleSignIn";

// GIS admite UNA configuración por página: se inicializa una vez por client
// ID y la respuesta se reparte al botón montado en ese momento. Inicializarlo
// en cada render (al cambiar Entrar/Crear) hacía que Google avisara.
let initializedClientId = null;
let activeCredentialHandler = null;

export function GoogleLogo({ className = "h-5 w-5" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Botón de Google con el aspecto de la marca (fondo oscuro, «G» a color) para
 * donde no se puede usar el oficial: la app de Android —Google no permite su
 * ventana dentro de un WebView— y el respaldo por redirección.
 */
export function GoogleBrandButton({ href, onClick, disabled = false, children }) {
  const className =
    "flex h-10 w-full items-center justify-center gap-3 rounded-[4px] border border-[#8E918F] bg-[#131314] px-3 text-sm font-medium text-[#E3E3E3] transition-colors hover:bg-[#1f1f20] active:bg-[#2a2a2b] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer";
  const content = (
    <>
      <GoogleLogo />
      <span>{children}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} onClick={onClick} aria-disabled={disabled || undefined} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {content}
    </button>
  );
}

export default function GoogleSignInButton({
  clientId,
  mode = "login",
  onCredential,
  fallbackHref,
  label = "Continuar con Google",
}) {
  const hostRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [status, setStatus] = useState(clientId ? "loading" : "failed");

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId) {
      setStatus("failed");
      return undefined;
    }
    let alive = true;
    let observer = null;
    let lastWidth = 0;
    const handler = (credential) => callbackRef.current?.(credential);

    const render = (gis) => {
      const host = hostRef.current;
      if (!alive || !host) return;
      const width = Math.round(host.getBoundingClientRect().width);
      if (!width || width === lastWidth) return;
      lastWidth = width;
      host.innerHTML = "";
      gis.renderButton(host, googleButtonOptions({ width, mode }));
    };

    loadGoogleIdentityScript()
      .then((gis) => {
        if (!alive) return;
        if (initializedClientId !== clientId) {
          gis.initialize({
            client_id: clientId,
            callback: (response) => {
              if (response?.credential) activeCredentialHandler?.(response.credential);
            },
            ux_mode: "popup",
            // Ventana de cuentas del propio navegador (FedCM) donde exista.
            use_fedcm_for_button: true,
            auto_select: false,
            cancel_on_tap_outside: true,
            itp_support: true,
          });
          initializedClientId = clientId;
        }
        activeCredentialHandler = handler;
        render(gis);
        setStatus("ready");
        // El ancho del botón lo fija Google al pintarlo: si cambia el hueco
        // (girar el móvil, redimensionar), se vuelve a pintar a la medida.
        if (typeof ResizeObserver !== "undefined" && hostRef.current) {
          observer = new ResizeObserver(() => render(gis));
          observer.observe(hostRef.current);
        }
      })
      .catch(() => {
        if (alive) setStatus("failed");
      });

    return () => {
      alive = false;
      observer?.disconnect();
      if (activeCredentialHandler === handler) activeCredentialHandler = null;
    };
  }, [clientId, mode]);

  if (status === "failed") {
    return <GoogleBrandButton href={fallbackHref}>{label}</GoogleBrandButton>;
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      {/* Hueco del botón oficial: 40 px, el alto del tamaño `large`. */}
      <div className="relative h-10 w-full">
        <div
          ref={hostRef}
          className="flex h-10 w-full justify-center overflow-hidden rounded-[4px] [color-scheme:normal]"
        />
        {status === "loading" && (
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-[4px] border border-[#8E918F]/50 bg-[#131314]"
          />
        )}
      </div>
      {status === "ready" && fallbackHref && (
        <a
          href={fallbackHref}
          className="text-[11px] text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300 hover:underline"
        >
          ¿No se abre la ventana? Usa la página de Google
        </a>
      )}
    </div>
  );
}
