/**
 * @file frontend/src/hooks/useFetch.js
 * @description Reusable data fetching hook with stale-while-revalidate caching
 * @author Dev B (original), Dev A (SWR caching layer)
 *
 * v2 (commit 231 — Dev A) adds a stale-while-revalidate cache so that
 * components rendering the same endpoint don't each pay the round-trip
 * cost on every mount. The flow on a cache hit is:
 *
 *   1. Return cached data synchronously (loading = false, instant UI)
 *   2. If the entry is older than `cacheMs`, kick off a SILENT background
 *      revalidation that updates the cache + notifies subscribers
 *   3. All other components subscribed to the same key see the fresh
 *      value via a tiny pub/sub
 *
 * Mutations elsewhere in the app can call `invalidate(pattern)` or
 * `mutate(key, newData)` to clear / overwrite entries — e.g. after
 * `POST /employees` succeeds, the parent calls
 * `invalidate('/employees')` and every list that depends on it re-fetches.
 *
 * The cache is module-scoped (lives for the SPA's lifetime). It is
 * intentionally NOT persisted to localStorage — auth-sensitive data
 * should not survive a page close, and SWR is for warm-cache scenarios,
 * not offline.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';

/* ──────────────────────────────────────────────────────────────────── */
/* Module-level cache                                                   */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Default freshness window. Cached entries newer than this are returned
 * without any background fetch; older entries are returned immediately
 * but trigger a revalidation. 30s strikes a balance between snappy
 * navigation and "data feels stale" — most HRMS data (employees,
 * departments) changes far less often than that.
 */
const DEFAULT_CACHE_MS = 30 * 1000;

/** key → { data, timestamp } */
const cache = new Map();

/** key → Set<callback> — pub/sub for cross-component cache updates */
const subscribers = new Map();

/**
 * Stable JSON stringify — sorts object keys so {a:1,b:2} and {b:2,a:1}
 * produce identical cache keys. Critical because callers often pass
 * params built up in different orders across renders.
 */
const stableStringify = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${k}:${stableStringify(value[k])}`).join(',')}}`;
};

/**
 * Build a deterministic cache key from request parameters. Only GET
 * requests are ever cached (mutations don't have idempotent results).
 */
const buildKey = (url, params, method) => {
  if (method.toUpperCase() !== 'GET') return null;
  return `${method.toUpperCase()} ${url}?${stableStringify(params)}`;
};

/** Notify every subscriber on a key. `value === null` signals removal. */
const notify = (key, value) => {
  const subs = subscribers.get(key);
  if (!subs) return;
  // Materialize to array first — callbacks may unsubscribe themselves.
  Array.from(subs).forEach((cb) => {
    try {
      cb(value);
    } catch {
      // Swallow subscriber errors to protect other listeners.
    }
  });
};

/* ──────────────────────────────────────────────────────────────────── */
/* Public cache mutators — call from anywhere in the app                */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Invalidate cached entries. Accepts:
 *   - A string substring: every key containing it is dropped
 *   - A RegExp: every key matching is dropped
 *   - A predicate function: receives the key, returns true to drop
 *   - `undefined`: clears the entire cache (use sparingly — usually
 *     only on logout)
 *
 * After invalidation, all live subscribers refetch on next render so
 * the UI doesn't keep showing stale rows.
 *
 * @param {string|RegExp|Function|undefined} pattern
 */
export const invalidate = (pattern) => {
  const matches = (key) => {
    if (pattern === undefined) return true;
    if (typeof pattern === 'string') return key.includes(pattern);
    if (pattern instanceof RegExp) return pattern.test(key);
    if (typeof pattern === 'function') return Boolean(pattern(key));
    return false;
  };

  const removedKeys = [];
  for (const key of cache.keys()) {
    if (matches(key)) removedKeys.push(key);
  }
  for (const key of removedKeys) {
    cache.delete(key);
    notify(key, null);
  }
};

/**
 * Optimistically overwrite a cached entry (or invalidate it). Useful
 * after a successful PATCH/PUT so the UI can reflect the new value
 * without a full round-trip.
 *
 *   mutate('GET /employees/42?', updatedEmployee)
 *
 * If `newData` is omitted the entry is invalidated instead (subscribers
 * will refetch on next render).
 *
 * @param {string} key
 * @param {*} [newData]
 */
export const mutate = (key, newData) => {
  if (newData === undefined) {
    cache.delete(key);
    notify(key, null);
    return;
  }
  cache.set(key, { data: newData, timestamp: Date.now() });
  notify(key, newData);
};

/**
 * Read the current cache size — useful for debugging and unit tests.
 * Not part of the public hook contract.
 */
export const __getCacheSize = () => cache.size;

/* ──────────────────────────────────────────────────────────────────── */
/* useFetch                                                             */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * useFetch — fetches data from the given URL with SWR-style caching.
 *
 * @template T
 * @param {string} url - Target URL (relative to axios baseURL)
 * @param {Object} [options]
 * @param {*} [options.params] - Query params
 * @param {*} [options.body] - Request body (for non-GET methods)
 * @param {string} [options.method='GET'] - HTTP method
 * @param {boolean} [options.skip=false] - Skip the initial fetch if true
 * @param {number} [options.cacheMs] - Freshness window in ms (default
 *   30000 for GET, 0 for everything else). Pass `0` to disable caching
 *   entirely for a specific call site.
 * @param {boolean} [options.revalidateOnMount=true] - On cache hit, run
 *   a background revalidation. Disable for very stable resources
 *   (e.g., role lookup) where avoiding the extra request matters more
 *   than freshness.
 * @returns {{ data: T|null, loading: boolean, error: Error|null,
 *   refetch: Function, isStale: boolean, cacheKey: string|null }}
 */
const useFetch = (url, options = {}) => {
  const {
    params,
    body,
    method = 'GET',
    skip = false,
    cacheMs,
    revalidateOnMount = true,
  } = options;

  // Effective cache window — undefined falls back to per-method default.
  const effectiveCacheMs =
    cacheMs !== undefined
      ? cacheMs
      : method.toUpperCase() === 'GET'
        ? DEFAULT_CACHE_MS
        : 0;

  // Re-run effects only when meaningful inputs change.
  const optionsKey = useMemo(
    () => stableStringify({ params, body, method }),
    [params, body, method]
  );

  const cacheKey = useMemo(
    () => buildKey(url, params, method),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, optionsKey]
  );

  // Initial state — seed from cache when possible to avoid a loading
  // flash on tab re-entry.
  const initialEntry =
    cacheKey && effectiveCacheMs > 0 ? cache.get(cacheKey) : null;

  const [data, setData] = useState(initialEntry?.data ?? null);
  const [loading, setLoading] = useState(!skip && !initialEntry);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(
    initialEntry
      ? Date.now() - initialEntry.timestamp > effectiveCacheMs
      : false
  );

  // Track mount state for safe state updates after async ops.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Execute the fetch request. `silent` mode is used for background
   * revalidations — it skips the `setLoading(true)` toggle so users
   * don't see a spinner over stale-but-correct data.
   */
  const fetchData = useCallback(
    async (signal, { silent = false } = {}) => {
      if (!url || skip) return;

      if (!silent) setLoading(true);
      setError(null);

      try {
        const response = await axiosInstance.request({
          url,
          method,
          params,
          data: body,
          signal,
        });
        const payload = response.data?.data ?? response.data;

        // Persist + broadcast on successful GETs.
        if (cacheKey && effectiveCacheMs > 0) {
          cache.set(cacheKey, { data: payload, timestamp: Date.now() });
          notify(cacheKey, payload);
        }

        if (isMountedRef.current) {
          setData(payload);
          setIsStale(false);
        }
      } catch (err) {
        // Ignore aborted requests — expected on unmount / fast nav.
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (isMountedRef.current) {
          setError(err);
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [url, method, params, body, skip, cacheKey, effectiveCacheMs]
  );

  /**
   * SWR effect — on mount / key change:
   *   - Cache miss → normal fetch (loading state shown)
   *   - Cache hit fresh → use cached, no fetch
   *   - Cache hit stale → use cached immediately + silent revalidate
   */
  useEffect(() => {
    if (skip || !url) return;

    const controller = new AbortController();

    if (cacheKey && effectiveCacheMs > 0) {
      const entry = cache.get(cacheKey);
      if (entry) {
        // Cache hit — render immediately.
        if (isMountedRef.current) {
          setData(entry.data);
          setLoading(false);
          setError(null);
        }
        const stale = Date.now() - entry.timestamp > effectiveCacheMs;
        if (stale && revalidateOnMount) {
          setIsStale(true);
          fetchData(controller.signal, { silent: true });
        } else {
          setIsStale(false);
        }
      } else {
        // Cache miss — normal fetch.
        fetchData(controller.signal);
      }
    } else {
      // Non-cacheable (mutation method or cacheMs === 0).
      fetchData(controller.signal);
    }

    return () => {
      controller.abort();
    };
  }, [fetchData, cacheKey, effectiveCacheMs, revalidateOnMount, skip, url]);

  /**
   * Subscribe to cache mutations on our key so updates from elsewhere
   * in the app (POST /employees → invalidate('/employees')) propagate
   * here without an explicit refetch call.
   */
  useEffect(() => {
    if (!cacheKey) return undefined;

    const onCacheChange = (newValue) => {
      if (!isMountedRef.current) return;
      if (newValue === null) {
        // Entry invalidated — refetch to repopulate.
        const controller = new AbortController();
        fetchData(controller.signal, { silent: true });
      } else {
        // Entry rewritten (optimistic update from `mutate`).
        setData(newValue);
        setIsStale(false);
      }
    };

    let subs = subscribers.get(cacheKey);
    if (!subs) {
      subs = new Set();
      subscribers.set(cacheKey, subs);
    }
    subs.add(onCacheChange);

    return () => {
      subs.delete(onCacheChange);
      if (subs.size === 0) subscribers.delete(cacheKey);
    };
  }, [cacheKey, fetchData]);

  /**
   * Manual re-run (e.g. after a mutation). Bypasses the cache freshness
   * check and always hits the network.
   */
  const refetch = useCallback(() => {
    const controller = new AbortController();
    return fetchData(controller.signal);
  }, [fetchData]);

  return { data, loading, error, refetch, isStale, cacheKey };
};

export default useFetch;
