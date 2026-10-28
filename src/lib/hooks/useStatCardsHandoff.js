"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// Relevo de las tarjetas de la cabecera entre dos páginas hermanas
// (/history ↔ /continue-watching), que tienen tarjetas distintas.
//
// Son rutas distintas, así que al pasar de una a otra la página se monta de
// nuevo y sus tarjetas volverían a entrar. Cada página deja aquí lo que pintan
// las suyas (etiqueta, icono, color y cifra, por posición). La nueva, si llega
// desde la hermana (aún montada o desmontada hace un instante), pinta en su
// primer render esas mismas tarjetas, quietas, y en el siguiente fotograma
// pasa a las suyas: con `PageStatCard animateChanges` se relevan, animados,
// solo el icono, la cifra y la etiqueta que cambian.
//
// `cards`: [{ label, shortLabel?, value, loading, icon, iconKey, colorClass }].
const HANDOFF_MAX_AGE_MS = 1500;
const lastByGroup = new Map(); // groupId → { key, cards, leftAt }

function takeSiblingCards(groupId, pageKey) {
  const last = lastByGroup.get(groupId);
  if (!last || last.key === pageKey) return null;
  if (last.leftAt != null && Date.now() - last.leftAt > HANDOFF_MAX_AGE_MS) return null;
  return last.cards;
}

export function useStatCardsHandoff(groupId, pageKey, cards) {
  const [handoff, setHandoff] = useState(() => takeSiblingCards(groupId, pageKey));

  useEffect(() => {
    if (!handoff) return undefined;
    const frame = requestAnimationFrame(() => setHandoff(null));
    return () => cancelAnimationFrame(frame);
  }, [handoff]);

  // Lo último que pinta esta página, para la hermana. Sin dependencias a
  // propósito: es una asignación barata y así nunca queda desfasada.
  useLayoutEffect(() => {
    if (!handoff) lastByGroup.set(groupId, { key: pageKey, cards, leftAt: null });
  });

  useLayoutEffect(
    () => () => {
      const last = lastByGroup.get(groupId);
      if (last?.key === pageKey) lastByGroup.set(groupId, { ...last, leftAt: Date.now() });
    },
    [groupId, pageKey],
  );

  if (!handoff) return cards;
  return cards.map((card, index) => handoff[index] || card);
}
