"use client";

// Recogida de la sesión que el login de Google dejó en el navegador.
//
// POR QUÉ ES GLOBAL Y NO VIVE EN EL FORMULARIO DE LOGIN. Al abrir el login, el
// WebView empieza a navegar y la carcasa cancela esa navegación para mandar
// Google al navegador; dónde se queda exactamente la página depende del momento,
// así que no se puede dar por hecho que siga montado el formulario. Montado en
// el layout, la sesión se recoge esté donde esté la app.
//
// Fuera de la app de Android no hace absolutamente nada.

import { useEffect } from "react";

import {
  canjearIdTokenDeGoogle,
  entregaPendiente,
  isAndroidApp,
  logToApp,
  reclamarLoginPorNavegador,
  tomarResultadoNativoPendiente,
} from "@/lib/android/appBridge";

const REINTENTOS_AL_VOLVER = 20; // ~30 s: lo que tarda un login normal
const ESPERA_MS = 1500;

export default function AndroidSessionClaim() {
  useEffect(() => {
    if (!isAndroidApp()) return undefined;

    let vivo = true;
    let temporizador = null;

    // El deep link de vuelta trae ?google_claim=<id>; si no, se usa el que la
    // app guardó al abrir el navegador.
    const idDeLaUrl = new URLSearchParams(window.location.search).get("google_claim");

    const entrar = (destino) => {
      const limpio =
        typeof destino === "string" && destino.startsWith("/") ? destino : "/";
      window.location.replace(limpio);
    };

    // 1) ¿Quedó un resultado del selector de cuentas sin recoger? Pasa si Android
    //    recreó la actividad mientras el selector estaba encima: la página se
    //    recarga y quien esperaba la respuesta desaparece. El token sigue en el
    //    buzón del nativo, así que se canjea aquí y la sesión entra igual.
    const recogerLoginNativo = async () => {
      const pendiente = tomarResultadoNativoPendiente();
      if (!vivo || !pendiente) return false;
      if (pendiente.cancelled) return false;
      if (!pendiente.ok || !pendiente.idToken) {
        logToApp(`Google: resultado pendiente sin token (${pendiente.error || "?"})`);
        return false;
      }
      const canje = await canjearIdTokenDeGoogle(pendiente.idToken);
      if (!vivo || !canje.ok) return false;
      entrar("/");
      return true;
    };

    const intentar = async (restantes, idExplicito) => {
      if (!vivo) return;
      if (await recogerLoginNativo()) return;
      const id = idExplicito || entregaPendiente();
      if (!id) return;

      const resultado = await reclamarLoginPorNavegador(id);
      if (!vivo) return;

      if (resultado.status === "ready") {
        entrar(resultado.next);
        return;
      }
      // "pending" o un fallo de red: se reintenta un rato acotado. Con
      // "unknown"/"error" la entrega ya se ha olvidado y no hay nada que hacer.
      if (
        (resultado.status === "pending" || resultado.status === "network") &&
        restantes > 0
      ) {
        temporizador = window.setTimeout(
          () => intentar(restantes - 1, idExplicito),
          ESPERA_MS,
        );
      }
    };

    const alVolverAPrimerPlano = () => {
      if (document.visibilityState === "visible") intentar(REINTENTOS_AL_VOLVER);
    };

    // Al montar: pocas intentonas (puede que aún no haya nada), y a partir de
    // ahí cada vez que la app vuelve a primer plano.
    intentar(idDeLaUrl ? REINTENTOS_AL_VOLVER : 3, idDeLaUrl || undefined);
    document.addEventListener("visibilitychange", alVolverAPrimerPlano);
    window.addEventListener("focus", alVolverAPrimerPlano);

    return () => {
      vivo = false;
      if (temporizador) window.clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolverAPrimerPlano);
      window.removeEventListener("focus", alVolverAPrimerPlano);
    };
  }, []);

  return null;
}
