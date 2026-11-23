"use client";
import { useMemo } from "react";
import { sendEmbeddedDetailsAction } from "../navigation/embeddedDetails";
import { useRouter as useNextRouter } from "next/navigation";
import { isServerReachable } from "./client.js";
import { openSavedRoute } from "./navigation.js";
import {
  isDetailsNavigation,
  navigateWithCleanBackCapture,
  usesBackGestureCapture,
} from "../navigation/backGestureCapture.js";
import { isModalHistoryEntry, noteModalNavigation } from "../navigation/modalBackEntry.js";

export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => ({
    ...router,
    push(href, options) {
      if (sendEmbeddedDetailsAction("navigate", href)) return;
      // Un modal que se cierra para navegar no deshace su entrada: la
      // navegación la sustituye (ver lib/navigation/modalBackEntry).
      noteModalNavigation();
      if (isServerReachable()) {
        // A una ficha en el teléfono: que el gesto de atrás vuelva a esta
        // página tal cual (ver lib/navigation/backGestureCapture). Desde la
        // entrada de un modal no hace falta: esa entrada ya es la captura.
        if (usesBackGestureCapture() && isDetailsNavigation(href) && !isModalHistoryEntry()) {
          return navigateWithCleanBackCapture(() => router.push(href, options));
        }
        return router.push(href, options);
      }
      return openSavedRoute(href, { navigate: (path) => router.push(path, options) });
    },
    replace(href, options) {
      if (sendEmbeddedDetailsAction("navigate", href)) return;
      noteModalNavigation();
      if (isServerReachable()) return router.replace(href, options);
      return openSavedRoute(href, { replace: true, navigate: (path) => router.replace(path, options) });
    },
    back() {
      if (!sendEmbeddedDetailsAction("close")) router.back();
    },
    refresh() { if (isServerReachable()) router.refresh(); },
    prefetch(href, options) { if (isServerReachable()) return router.prefetch(href, options); },
  }), [router]);
}
