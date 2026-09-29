export function resolveScrollRevealProps({
  hydrationReady,
  reduceMotion,
  isBackNav,
  hasScrolled,
  margin = "-80px",
}) {
  if (!hydrationReady) {
    return { initial: "hidden", animate: "hidden" };
  }
  if (reduceMotion || isBackNav) {
    return { initial: false, animate: "visible" };
  }
  if (!hasScrolled) {
    return { initial: "hidden", animate: "hidden" };
  }
  return {
    initial: "hidden",
    whileInView: "visible",
    viewport: { once: true, margin },
  };
}

export function resolveTopResetRevealProps({
  enabled,
  hydrationReady,
  reduceMotion,
  isBackNav,
  hasScrolled,
  revealed,
}) {
  if (!enabled) return null;
  if (!hydrationReady) {
    return { initial: "hidden", animate: "hidden" };
  }
  // Al volver (atrás/adelante) la página se monta ya en su estado final
  // (`initial: false`, sin animación de entrada), pero con el scroll arriba la
  // sección sigue oculta: si no, en móvil asoma tras la navbar inferior. Solo
  // depende del scroll (no de `revealed`, que usa el observador con margen y
  // puede no dispararse al restaurar la posición). Etiquetas de variante y no
  // un objeto: con un objeto, el motion.div heredaría el "visible" del padre.
  if (isBackNav) {
    return { initial: false, animate: hasScrolled ? "visible" : "hidden" };
  }
  if (reduceMotion) {
    return {
      initial: false,
      animate: { opacity: hasScrolled && revealed ? 1 : 0, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: "hidden",
    animate: hasScrolled && revealed ? "visible" : "hidden",
  };
}
