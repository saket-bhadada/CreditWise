import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Generic data-loading hook with cancellation.
 *   const { data, error, loading, reload } = useApi((signal) => api.getOverview({ signal }), []);
 * Stale responses are discarded and aborted requests never surface as errors.
 */
export function useApi(fetcher, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: immediate });
  const controllerRef = useRef(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetcherRef.current(controller.signal);
      if (controller.signal.aborted) return null;
      setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (controller.signal.aborted || error?.kind === "ABORTED") return null;
      setState((s) => ({ data: s.data, error, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    return () => controllerRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run };
}
