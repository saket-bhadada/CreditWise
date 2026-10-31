import { useEffect, useState } from "react";

const cache = new Map();

/** Probe whether an image URL actually loads as an image (SPA fallbacks return HTML, which fails). */
function probe(src) {
  if (!cache.has(src)) {
    cache.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      })
    );
  }
  return cache.get(src);
}

/** null = checking, true = available, false = missing/broken */
export function useAsset(src) {
  const [ok, setOk] = useState(null);
  useEffect(() => {
    let live = true;
    probe(src).then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [src]);
  return ok;
}

export function useAssets(list) {
  const [state, setState] = useState(list.map(() => null));
  const key = list.join("|");
  useEffect(() => {
    let live = true;
    Promise.all(list.map(probe)).then((vals) => live && setState(vals));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
