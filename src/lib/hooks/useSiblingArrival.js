"use client";

import { useLayoutEffect, useState } from "react";

// ¿Se ha llegado a esta página desde su página hermana (la otra sección del
// mismo selector, p. ej. /history ↔ /continue-watching)?
//
// Son rutas distintas, así que al pasar de una a otra la página se monta de
// nuevo y su barra repetiría la entrada. Cada página se apunta aquí con su
// `pageKey` dentro de un `groupId`. La nueva lo lee en su primer render,
// cuando la anterior aún está montada (o se desmontó hace un instante). Si se
// llega desde otra página, o se vuelve pasado un rato, da false.
const HANDOFF_MAX_AGE_MS = 1500;
const lastByGroup = new Map(); // groupId → { key, leftAt }

function arrivedFromSibling(groupId, pageKey) {
  const last = lastByGroup.get(groupId);
  if (!last || last.key === pageKey) return false;
  return last.leftAt == null || Date.now() - last.leftAt < HANDOFF_MAX_AGE_MS;
}

export function useSiblingArrival(groupId, pageKey) {
  const [fromSibling] = useState(() => arrivedFromSibling(groupId, pageKey));

  useLayoutEffect(() => {
    lastByGroup.set(groupId, { key: pageKey, leftAt: null });
    return () => {
      const last = lastByGroup.get(groupId);
      if (last?.key === pageKey) lastByGroup.set(groupId, { key: pageKey, leftAt: Date.now() });
    };
  }, [groupId, pageKey]);

  return fromSibling;
}
