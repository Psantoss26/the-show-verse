"use client";
import { useMemo } from "react";
import { sendEmbeddedDetailsAction } from "../navigation/embeddedDetails";
import { useRouter as useNextRouter } from "next/navigation";
import { isServerReachable } from "./client.js";
import { openSavedRoute } from "./navigation.js";

export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => ({
    ...router,
    push(href, options) {
      if (sendEmbeddedDetailsAction("navigate", href)) return;
      if (isServerReachable()) return router.push(href, options);
      return openSavedRoute(href, { navigate: (path) => router.push(path, options) });
    },
    replace(href, options) {
      if (sendEmbeddedDetailsAction("navigate", href)) return;
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
