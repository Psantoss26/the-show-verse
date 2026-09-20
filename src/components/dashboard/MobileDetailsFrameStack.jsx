"use client";

// Doble búfer de `MobileDetailsFrame`: como mucho DOS <iframe> a la vez, el
// VISIBLE (contenido real, ya cargado) y, si el título acaba de cambiar, uno
// PENDIENTE cargando detrás y oculto. En cuanto el pendiente avisa que ya
// pintó su propio hero (`onFrameReady`), pasa a ser el visible y el anterior
// se descarta.
//
// Por qué existe: cambiar el `src` de un solo iframe siempre implica una
// recarga completa de documento, y mientras tanto no hay nada real que
// enseñar. Mostrar una previsualización "de mentira" (aunque fuese fiel)
// tiene el mismo problema: en algún momento cambia visiblemente a la ficha
// real, y eso ES el parpadeo/estado intermedio que no queremos. Con dos
// búferes, lo que hay en pantalla es SIEMPRE una ficha real de algún
// título -- como mucho la del título anterior durante el instante que tarda
// el nuevo en estar listo -- y nunca una versión aproximada.
//
// La ÚNICA situación sin nada previo que enseñar es la primerísima apertura
// (no hay "anterior"): ahí, igual que el propio DetailModal mientras no tiene
// `hasHeroArt`, se ve el esqueleto neutro de `MobileDetailsPreviewOverlay`.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import MobileDetailsFrame from "@/components/dashboard/MobileDetailsFrame";
import MobileDetailsPreviewOverlay from "@/components/dashboard/MobileDetailsPreviewOverlay";

let slotSeq = 0;

export default function MobileDetailsFrameStack({ href, seed, title, onClose }) {
  const [visibleSlot, setVisibleSlot] = useState(() => ({
    id: ++slotSeq,
    href,
    seed,
  }));
  const [pendingSlot, setPendingSlot] = useState(null);
  const [visibleReady, setVisibleReady] = useState(false);

  const visibleSlotRef = useRef(visibleSlot);
  useEffect(() => {
    visibleSlotRef.current = visibleSlot;
  }, [visibleSlot]);

  useEffect(() => {
    if (visibleSlotRef.current.href === href) {
      // El usuario volvió al título que ya se está mostrando: si había un
      // pendiente de OTRO título cargando, ya no hace falta.
      setPendingSlot((p) => (p && p.href !== href ? null : p));
      return;
    }
    setPendingSlot((p) => (p?.href === href ? p : { id: ++slotSeq, href, seed }));
    // `seed` se congela al crear el slot (igual que hace `MobileDetailsFrame`
    // con `href`): si cambia más tarde para este mismo título no debe reabrir
    // ni recalcular nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href]);

  const handlePendingReady = () => {
    if (!pendingSlot) return;
    setVisibleSlot(pendingSlot);
    setVisibleReady(true);
    setPendingSlot(null);
  };

  return (
    <>
      <div className="absolute inset-0">
        <MobileDetailsFrame
          key={visibleSlot.id}
          href={visibleSlot.href}
          seed={visibleSlot.seed}
          title={title}
          onClose={onClose}
          onFrameReady={() => setVisibleReady(true)}
        />
      </div>

      {/* Solo existe mientras el visible actual NO ha llegado a pintar nunca
          (primerísima apertura, sin nada real que enseñar todavía). Una vez
          `visibleReady`, ya no vuelve a aparecer para ESTE panel aunque se
          cambie de título -- el visible anterior (real) cubre ese hueco. */}
      <AnimatePresence>
        {!visibleReady && <MobileDetailsPreviewOverlay key="skeleton" />}
      </AnimatePresence>

      {pendingSlot && (
        <div
          className="absolute inset-0 opacity-0"
          style={{ pointerEvents: "none" }}
          aria-hidden="true"
        >
          <MobileDetailsFrame
            key={pendingSlot.id}
            href={pendingSlot.href}
            seed={pendingSlot.seed}
            title={title}
            onClose={onClose}
            onFrameReady={handlePendingReady}
          />
        </div>
      )}
    </>
  );
}
