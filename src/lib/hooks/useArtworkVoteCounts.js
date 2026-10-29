"use client";

import { useEffect, useMemo, useState } from "react";
import {
  adjustArtworkVoteCounts,
  fetchArtworkVoteCounts,
  readPersistedArtworkOverride,
  subscribeCommunityArtwork,
} from "@/lib/artworkApi";
import { useOwnCardPostersVersion } from "@/lib/hooks/useOwnCardPoster";

// Cuántas veces está elegida cada imagen de un título (`{ type, id }`, también
// `season` y `collection`), por tipo: { poster: { '/x.jpg': 3 } }. Se pide al
// abrir «Portadas y fondos» y otra vez cuando otra vista del título avisa de
// votos nuevos; elegir aquí mueve el voto propio al momento (instantánea de la
// cuenta, que AuthContext reescribe en cada elección).
export default function useArtworkVoteCounts(target) {
  const type = target?.type || null;
  const id = target?.id ?? null;
  const [state, setState] = useState(null); // { key, counts, ownAtFetch }
  const key = type && id != null ? `${type}:${id}` : null;
  const version = useOwnCardPostersVersion();

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    const load = () => {
      const ownAtFetch = readPersistedArtworkOverride({ type, id }) || {};
      fetchArtworkVoteCounts({ type, id }).then((counts) => {
        if (!cancelled && counts) setState({ key, counts, ownAtFetch });
      });
    };
    load();
    const unsubscribe = subscribeCommunityArtwork({ type, id }, (event) => {
      if (event.refresh) load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key, type, id]);

  return useMemo(() => {
    if (!state || state.key !== key) return null;
    // `version` cambia con la instantánea: la elección propia de ahora.
    void version;
    const ownNow = readPersistedArtworkOverride({ type, id }) || {};
    return adjustArtworkVoteCounts(state.counts, state.ownAtFetch, ownNow);
  }, [state, key, type, id, version]);
}
