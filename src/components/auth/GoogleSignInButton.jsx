"use client";

// Botón «Continuar con Google» del formulario de acceso.
//
// El diseño es PROPIO —el vidrio de los botones de los modales de la ficha, 44 px
// de alto— y al pulsarlo se abre la ventana emergente oficial
// de Google para elegir cuenta sin salir de la página (Google Identity
// Services, flujo de código OAuth). El código llega por `onCredential` como
// `{ code }` y lo canjea el servidor.
//
// Es un enlace a la redirección clásica: sin JavaScript, si el script de Google
// no carga o si el navegador bloquea la ventana, se entra por la página de
// Google y nada se queda a medias.

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import {
  googleCodeClientOptions,
  googlePopupNextStep,
  loadGoogleIdentityScript,
} from "@/lib/auth/googleSignIn";
import { LIQUID_GLASS_MODAL_BUTTON } from "@/lib/ui/liquidGlass";

export function GoogleLogo({ className = "h-[18px] w-[18px]" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// Mismo vidrio que los botones de los modales de la ficha.
const brandButtonClass =
  "relative flex h-11 w-full cursor-pointer select-none items-center justify-center gap-3 px-4 text-sm font-bold " +
  `${LIQUID_GLASS_MODAL_BUTTON} active:scale-[0.985] ` +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 " +
  "aria-busy:cursor-default aria-busy:active:scale-100 disabled:cursor-default disabled:opacity-60";

/**
 * Aspecto común del botón de Google: la web, la app de Android (Google no
 * permite su ventana dentro de un WebView), el respaldo por redirección y el
 * estado «Entrando con Google…» (`busy`) se ven igual.
 */
export function GoogleBrandButton({ href, onClick, disabled = false, busy = false, children }) {
  const content = (
    <>
      {busy ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin text-zinc-300" aria-hidden="true" />
      ) : (
        <GoogleLogo />
      )}
      <span>{busy ? "Entrando con Google…" : children}</span>
    </>
  );
  if (busy) {
    return (
      <div role="status" aria-busy="true" className={brandButtonClass}>
        {content}
      </div>
    );
  }
  if (href) {
    return (
      <a href={href} onClick={onClick} aria-disabled={disabled || undefined} className={brandButtonClass}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={brandButtonClass}>
      {content}
    </button>
  );
}

export default function GoogleSignInButton({
  clientId,
  mode = "login",
  onCredential,
  onError,
  fallbackHref,
  busy = false,
  label = "Continuar con Google",
}) {
  const clientRef = useRef(null);
  const handlersRef = useRef({ onCredential, onError, fallbackHref });

  useEffect(() => {
    handlersRef.current = { onCredential, onError, fallbackHref };
  }, [onCredential, onError, fallbackHref]);

  // El cliente se prepara al montar: la ventana tiene que abrirse en el mismo
  // clic (sin esperas) o el navegador la bloquea.
  useEffect(() => {
    if (!clientId) return undefined;
    let alive = true;

    const fail = (failure) => {
      const step = googlePopupNextStep(failure);
      if (step === "stay") return;
      const { fallbackHref: href, onError: reportError } = handlersRef.current;
      if (step === "redirect" && href) {
        window.location.assign(href);
        return;
      }
      reportError?.(failure?.error || failure?.type || "google_popup_failed");
    };

    loadGoogleIdentityScript()
      .then((oauth2) => {
        if (!alive) return;
        clientRef.current = oauth2.initCodeClient({
          ...googleCodeClientOptions({ clientId, mode }),
          callback: (response) => {
            if (response?.code) handlersRef.current.onCredential?.({ code: response.code });
            else fail({ error: response?.error });
          },
          error_callback: fail,
        });
      })
      .catch(() => {
        // Sin script: el enlace lleva a la página de Google.
        clientRef.current = null;
      });

    return () => {
      alive = false;
      clientRef.current = null;
    };
  }, [clientId, mode]);

  const handleClick = (event) => {
    const client = clientRef.current;
    if (!client) return; // el enlace hace la redirección
    event.preventDefault();
    client.requestCode();
  };

  return (
    <GoogleBrandButton href={fallbackHref} onClick={handleClick} busy={busy}>
      {label}
    </GoogleBrandButton>
  );
}
