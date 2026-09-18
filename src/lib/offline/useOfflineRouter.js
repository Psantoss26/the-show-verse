"use client";
import { useMemo } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { isServerReachable } from "./client.js";
import { openSavedRoute } from "./navigation.js";

export function useRouter() {
  const router = useNextRouter();
  return useMemo(() => ({
    ...router,
    push(href, options) {
      if (isServerReachable()) return router.push(href, options);
      return openSavedRoute(href);
    },
    replace(href, options) {
      if (isServerReachable()) return router.replace(href, options);
      return openSavedRoute(href, { replace: true });
    },
    refresh() { if (isServerReachable()) router.refresh(); },
    prefetch(href, options) { if (isServerReachable()) return router.prefetch(href, options); },
  }), [router]);
}
