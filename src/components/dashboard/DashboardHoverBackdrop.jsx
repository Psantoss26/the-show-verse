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
const hoverBackdropPending = new Map();
const hoverBackdropPreloaded = new Set();
const HOVER_BACKDROP_SIZE = "original";
const HOVER_BACKDROP_PRELOAD_LIMIT = 8;

function getHoverBackdropKey(item) {
  if (!item?.id) return null;
  return `${getMediaTypeForItem(item)}:${item.id}`;
}

async function resolveHoverBackdropPath(item) {
  const key = getHoverBackdropKey(item);
  if (!key) return null;

  const cached = hoverBackdropCache.get(key);
  if (cached !== undefined) return cached;

  let pending = hoverBackdropPending.get(key);
  if (!pending) {
    pending = fetchBestBackdropNoLang(item.id, getMediaTypeForItem(item), {
      allowLanguageFallback: false,
    })
      .then((path) => path || null)
      .catch(() => null)
      .then((path) => {
        hoverBackdropCache.set(key, path);
        hoverBackdropPending.delete(key);
        return path;
      });
    hoverBackdropPending.set(key, pending);
  }

  return pending;
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

    const backdropPath = await resolveHoverBackdropPath(item);

    if (
      requestSeqRef.current !== requestSeq ||
      activeKeyRef.current !== key
    ) {
      return;
    }

    if (backdropPath) {
      preloadImage(buildImg(backdropPath, HOVER_BACKDROP_SIZE), {
        fetchPriority: "high",
      }).catch(() => {});
    }

    setActiveBackdrop(
      backdropPath
        ? { key, path: backdropPath }
        : null,
    );
  }, []);

  const prewarmHoverBackdrop = useCallback(async (item) => {
    const backdropPath = await resolveHoverBackdropPath(item);
    if (!backdropPath) return;

    const url = buildImg(backdropPath, HOVER_BACKDROP_SIZE);
    if (
      !hoverBackdropPreloaded.has(url) &&
      hoverBackdropPreloaded.size >= HOVER_BACKDROP_PRELOAD_LIMIT
    ) {
      return;
    }

    hoverBackdropPreloaded.add(url);
    await preloadImage(url, { fetchPriority: "low" }).catch(() => {});
  }, []);

  const clearHoverBackdrop = useCallback((item = null) => {
    const key = item ? getHoverBackdropKey(item) : null;
    if (key && activeKeyRef.current !== key) return;

    requestSeqRef.current += 1;
    activeKeyRef.current = null;
    setActiveBackdrop(null);
  }, []);

  const value = useMemo(
    () => ({
      activeBackdrop,
      showHoverBackdrop,
      clearHoverBackdrop,
      prewarmHoverBackdrop,
    }),
    [
      activeBackdrop,
      showHoverBackdrop,
      clearHoverBackdrop,
      prewarmHoverBackdrop,
    ],
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
      prewarmHoverBackdrop: () => {},
    }
  );
}

export function DashboardHoverBackdropLayer() {
  const { activeBackdrop } = useDashboardHoverBackdrop();
  const shouldReduceMotion = useReducedMotion();
  const imageUrl = activeBackdrop?.path
    ? buildImg(activeBackdrop.path, HOVER_BACKDROP_SIZE)
    : null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
      aria-hidden="true"
    >
      <AnimatePresence initial={false}>
        {imageUrl && (
          <motion.div
            key={activeBackdrop.key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0.01 : 0.32,
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
