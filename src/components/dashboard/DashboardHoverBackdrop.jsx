"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  buildImg,
  fetchBestBackdropNoLang,
  getMediaTypeForItem,
  preloadImage,
} from "@/lib/dashboard/media";

const DashboardHoverBackdropContext = createContext(null);
const hoverBackdropCache = new Map();

function getHoverBackdropKey(item) {
  if (!item?.id) return null;
  return `${getMediaTypeForItem(item)}:${item.id}`;
}

export function DashboardHoverBackdropProvider({ children }) {
  const [activeBackdrop, setActiveBackdrop] = useState(null);
  const activeKeyRef = useRef(null);
  const requestSeqRef = useRef(0);

  const showHoverBackdrop = useCallback(async (item) => {
    const key = getHoverBackdropKey(item);
    if (!key) return;

    activeKeyRef.current = key;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;

    let backdropPath = hoverBackdropCache.get(key);
    if (backdropPath === undefined) {
      try {
        backdropPath =
          (await fetchBestBackdropNoLang(item.id, getMediaTypeForItem(item), {
            allowLanguageFallback: false,
          })) || null;
      } catch {
        backdropPath = null;
      }
      hoverBackdropCache.set(key, backdropPath);
    }

    if (backdropPath) {
      await preloadImage(buildImg(backdropPath, "original")).catch(() => {});
    }

    if (
      requestSeqRef.current !== requestSeq ||
      activeKeyRef.current !== key
    ) {
      return;
    }

    setActiveBackdrop(backdropPath ? { key, path: backdropPath } : null);
  }, []);

  const clearHoverBackdrop = useCallback((item = null) => {
    const key = item ? getHoverBackdropKey(item) : null;
    if (key && activeKeyRef.current !== key) return;

    requestSeqRef.current += 1;
    activeKeyRef.current = null;
    setActiveBackdrop(null);
  }, []);

  const value = useMemo(
    () => ({ activeBackdrop, showHoverBackdrop, clearHoverBackdrop }),
    [activeBackdrop, showHoverBackdrop, clearHoverBackdrop],
  );

  return (
    <DashboardHoverBackdropContext.Provider value={value}>
      {children}
    </DashboardHoverBackdropContext.Provider>
  );
}

export function useDashboardHoverBackdrop() {
  return (
    useContext(DashboardHoverBackdropContext) || {
      activeBackdrop: null,
      showHoverBackdrop: () => {},
      clearHoverBackdrop: () => {},
    }
  );
}

export function DashboardHoverBackdropLayer() {
  const { activeBackdrop } = useDashboardHoverBackdrop();
  const shouldReduceMotion = useReducedMotion();
  const imageUrl = activeBackdrop?.path
    ? buildImg(activeBackdrop.path, "original")
    : null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
      aria-hidden="true"
    >
      <AnimatePresence mode="wait">
        {imageUrl && (
          <motion.div
            key={activeBackdrop.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0.01 : 0.45,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute inset-0"
          >
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${imageUrl})`,
                filter: "brightness(0.78) saturate(1.08)",
                transform: "scale(1.02)",
              }}
            />
            <div className="absolute inset-0 bg-black/24" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/54 via-black/8 to-black/72" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/48 via-transparent to-black/48" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
