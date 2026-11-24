"use client";

import { usePageTitle } from "@/lib/hooks/usePageTitle";

// Versión en componente de `usePageTitle`, para fijar el título desde un
// componente de servidor (p. ej. las fichas interceptadas, OverlayPageTitle).
export default function PageTitle({ title }) {
  usePageTitle(title);
  return null;
}
