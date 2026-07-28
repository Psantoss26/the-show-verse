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
  if (isBackNav) {
    return { initial: false, animate: "visible" };
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
