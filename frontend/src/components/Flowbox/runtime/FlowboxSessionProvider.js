import React, { useCallback, useEffect, useMemo, useState } from "react";

import { FlowboxSessionContext } from "./FlowboxSessionContext";
import {
  getAllStoredFlowboxBoxes,
  getFlowboxIndex,
  getStoredFlowboxBox,
  patchStoredFlowboxBox,
  saveFlowboxIndex,
} from "./flowboxSessionStorage";

function nowMs() {
  return Date.now();
}

function isActiveSession(session) {
  if (!session?.expiresAt) {return false;}
  const expiresAtMs = new Date(session.expiresAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs();
}

function sanitizeSession(session) {
  if (!session?.expiresAt && !session?.expires_at) {return null;}
  return {
    startedAt: session.startedAt || session.started_at || null,
    expiresAt: session.expiresAt || session.expires_at,
  };
}

function sanitizeBox(box, fallbackSlug = null) {
  if (!box && !fallbackSlug) {return null;}
  return {
    slug: box?.slug || fallbackSlug || null,
    name: box?.name || "",
    clientSlug: box?.clientSlug || box?.client_slug || null,
    requireLoc: box?.requireLoc ?? box?.require_loc ?? true,
    searchIncitationText:
      box?.searchIncitationText || box?.search_incitation_text || "",
    lastDepositDate: box?.lastDepositDate || box?.last_deposit_date || null,
    lastDepositSongImageUrl:
      box?.lastDepositSongImageUrl || box?.last_deposit_song_image_url || null,
  };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function cleanUndefinedEntries(payload) {
  return Object.entries(payload || {}).reduce((acc, [key, value]) => {
    if (value !== undefined) {acc[key] = value;}
    return acc;
  }, {});
}

function normalizeLoadedAt(value) {
  if (!value) {return null;}
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return value;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePointsBalance(value) {
  return typeof value === "number" ? value : null;
}

function normalizeDiscoverSnapshot(snapshot, fallbackSlug = null, { partial = false } = {}) {
  const source = snapshot || {};
  const normalized = {
    boxSlug: hasOwn(source, "boxSlug") || hasOwn(source, "box_slug")
      ? (source.boxSlug || source.box_slug || fallbackSlug || null)
      : undefined,
    loadedAt: hasOwn(source, "loadedAt") || hasOwn(source, "loaded_at") || hasOwn(source, "timestamp")
      ? normalizeLoadedAt(source.loadedAt || source.loaded_at || source.timestamp)
      : undefined,
    main: hasOwn(source, "main") ? (source.main || null) : undefined,
    olderDeposits: hasOwn(source, "olderDeposits") || hasOwn(source, "older_deposits")
      ? normalizeArray(source.olderDeposits || source.older_deposits)
      : undefined,
    olderDepositsNextCursor: hasOwn(source, "olderDepositsNextCursor") || hasOwn(source, "older_deposits_next_cursor")
      ? (source.olderDepositsNextCursor ?? source.older_deposits_next_cursor ?? null)
      : undefined,
    olderDepositsHasMore: hasOwn(source, "olderDepositsHasMore") || hasOwn(source, "older_deposits_has_more")
      ? Boolean(source.olderDepositsHasMore ?? source.older_deposits_has_more)
      : undefined,
    activePinnedDeposit: hasOwn(source, "activePinnedDeposit") || hasOwn(source, "active_pinned_deposit")
      ? (source.activePinnedDeposit || source.active_pinned_deposit || null)
      : undefined,
    myDeposit: hasOwn(source, "myDeposit") || hasOwn(source, "my_deposit")
      ? (source.myDeposit || source.my_deposit || null)
      : undefined,
    successes: hasOwn(source, "successes")
      ? (Array.isArray(source.successes) ? source.successes : [])
      : undefined,
    pointsBalance: hasOwn(source, "pointsBalance") || hasOwn(source, "points_balance")
      ? normalizePointsBalance(source.pointsBalance ?? source.points_balance)
      : undefined,
  };

  if (partial) {return cleanUndefinedEntries(normalized);}

  return {
    boxSlug: normalized.boxSlug || fallbackSlug || null,
    loadedAt: normalized.loadedAt || new Date().toISOString(),
    main: normalized.main ?? null,
    olderDeposits: normalized.olderDeposits || [],
    olderDepositsNextCursor: normalized.olderDepositsNextCursor ?? null,
    olderDepositsHasMore: Boolean(normalized.olderDepositsHasMore),
    activePinnedDeposit: normalized.activePinnedDeposit ?? null,
    myDeposit: normalized.myDeposit ?? null,
    successes: normalized.successes || [],
    pointsBalance: normalized.pointsBalance ?? null,
  };
}

export default function FlowboxSessionProvider({ children }) {
  const initialIndex = useMemo(() => getFlowboxIndex(), []);
  const [boxesBySlug, setBoxesBySlug] = useState(() => getAllStoredFlowboxBoxes());
  const [currentFlowboxSlug, setCurrentFlowboxSlug] = useState(
    initialIndex.currentFlowboxSlug || null
  );
  const [lastVisitedFlowboxSlug, setLastVisitedFlowboxSlug] = useState(
    initialIndex.lastVisitedFlowboxSlug || null
  );
  const [sessionLoadStateBySlug, setSessionLoadStateBySlug] = useState({});
  const [uiHintsBySlug, setUiHintsBySlug] = useState({});

  const persistBoxState = useCallback((boxSlug, updater) => {
    if (!boxSlug) {return null;}
    let nextState = null;
    setBoxesBySlug((prev) => {
      const current = prev[boxSlug] || {};
      nextState = typeof updater === "function" ? updater(current) : updater;
      patchStoredFlowboxBox(boxSlug, nextState);
      return {
        ...prev,
        [boxSlug]: nextState,
      };
    });
    return nextState;
  }, []);

  const saveBoxBootstrap = useCallback((payload) => {
    const slug = payload?.slug;
    if (!slug) {return null;}

    return persistBoxState(slug, (current) => ({
      ...current,
      box: {
        ...(current.box || {}),
        ...sanitizeBox(payload, slug),
      },
    }));
  }, [persistBoxState]);

  const markFlowboxVisited = useCallback((slug) => {
    if (!slug) {return;}
    setCurrentFlowboxSlug(slug);
    setLastVisitedFlowboxSlug(slug);
    const currentIndex = getFlowboxIndex();
    saveFlowboxIndex({
      ...currentIndex,
      currentFlowboxSlug: slug,
      lastVisitedFlowboxSlug: slug,
      knownBoxSlugs: Array.from(new Set([...(currentIndex.knownBoxSlugs || []), slug])).filter(Boolean),
    });
  }, []);

  const clearCurrentFlowboxSlug = useCallback(() => {
    setCurrentFlowboxSlug(null);
    const currentIndex = getFlowboxIndex();
    saveFlowboxIndex({
      ...currentIndex,
      currentFlowboxSlug: null,
    });
  }, []);

  const saveVerifiedSession = useCallback((payload, options = {}) => {
    const box = sanitizeBox(payload?.box, payload?.box?.slug || payload?.boxSlug || payload?.slug);
    const slug = box?.slug;
    const session = sanitizeSession(payload?.session || payload);
    if (!slug || !session) {return null;}

    const next = persistBoxState(slug, (current) => ({
      ...current,
      box: {
        ...(current.box || {}),
        ...box,
      },
      session,
      lastSessionExpiredAt: null,
    }));

    setUiHintsBySlug((prev) => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        enterHintPending: Boolean(options.triggerEnterHint),
        threeMinWarningShown: false,
      },
    }));

    return next;
  }, [persistBoxState]);

  const saveDiscoverSnapshot = useCallback((boxSlug, snapshot) => {
    if (!boxSlug) {return null;}
    return persistBoxState(boxSlug, (current) => {
      const normalizedSnapshot = normalizeDiscoverSnapshot(snapshot, boxSlug);
      return {
        ...current,
        discoverSnapshot: {
          cachedAt: normalizedSnapshot.loadedAt,
          data: normalizedSnapshot,
        },
      };
    });
  }, [persistBoxState]);

  const patchDiscoverSnapshot = useCallback((boxSlug, patch) => {
    if (!boxSlug) {return null;}
    return persistBoxState(boxSlug, (current) => {
      const currentSnapshot = normalizeDiscoverSnapshot(
        current?.discoverSnapshot?.data || {},
        boxSlug
      );
      const normalizedPatch = normalizeDiscoverSnapshot(patch, boxSlug, { partial: true });
      const nextSnapshot = {
        ...currentSnapshot,
        ...normalizedPatch,
        boxSlug: normalizedPatch.boxSlug || currentSnapshot.boxSlug || boxSlug,
      };
      return {
        ...current,
        discoverSnapshot: {
          cachedAt: nextSnapshot.loadedAt,
          data: nextSnapshot,
        },
      };
    });
  }, [persistBoxState]);

  const clearDiscoverSnapshot = useCallback((boxSlug) => {
    if (!boxSlug) {return null;}
    return persistBoxState(boxSlug, (current) => ({
      ...current,
      discoverSnapshot: null,
    }));
  }, [persistBoxState]);

  const clearBoxSession = useCallback((boxSlug, { markExpired = false } = {}) => {
    if (!boxSlug) {return null;}
    return persistBoxState(boxSlug, (current) => ({
      ...current,
      session: null,
      discoverSnapshot: null,
      lastSessionExpiredAt: markExpired ? new Date().toISOString() : (current?.lastSessionExpiredAt || null),
    }));
  }, [persistBoxState]);

  const expireBoxSession = useCallback((boxSlug) => {
    if (!boxSlug) {return null;}
    return clearBoxSession(boxSlug, { markExpired: true });
  }, [clearBoxSession]);

  const getBoxRuntime = useCallback((boxSlug) => {
    if (!boxSlug) {return null;}
    return boxesBySlug[boxSlug] || null;
  }, [boxesBySlug]);

  const getDiscoverSnapshot = useCallback((boxSlug) => {
    return boxesBySlug?.[boxSlug]?.discoverSnapshot?.data || null;
  }, [boxesBySlug]);

  const getActiveSessionForSlug = useCallback((boxSlug) => {
    const session = boxesBySlug?.[boxSlug]?.session || null;
    return isActiveSession(session) ? session : null;
  }, [boxesBySlug]);

  const consumeEnterHint = useCallback((boxSlug) => {
    if (!boxSlug) {return;}
    setUiHintsBySlug((prev) => ({
      ...prev,
      [boxSlug]: {
        ...prev[boxSlug],
        enterHintPending: false,
      },
    }));
  }, []);

  const markThreeMinWarningShown = useCallback((boxSlug) => {
    if (!boxSlug) {return;}
    setUiHintsBySlug((prev) => ({
      ...prev,
      [boxSlug]: {
        ...prev[boxSlug],
        threeMinWarningShown: true,
      },
    }));
  }, []);

  const ensureBoxSession = useCallback(async (boxSlug) => {
    if (!boxSlug) {return { active: false };}

    let shouldFetch = true;
    setSessionLoadStateBySlug((prev) => {
      if (prev[boxSlug] === "loading") {
        shouldFetch = false;
        return prev;
      }
      return {
        ...prev,
        [boxSlug]: prev[boxSlug] === "loaded" ? "loaded" : "loading",
      };
    });

    if (!shouldFetch) {
      return { active: false, skipped: true };
    }

    try {
      const response = await fetch(
        `/box-management/box-session/?boxSlug=${encodeURIComponent(boxSlug)}`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || "SESSION_LOAD_FAILED");
      }

      if (data?.active && data?.session) {
        saveVerifiedSession(data, { triggerEnterHint: false });
      } else {
        const currentRuntime = getStoredFlowboxBox(boxSlug) || null;
        clearBoxSession(boxSlug, {
          markExpired: Boolean(currentRuntime?.session || currentRuntime?.lastSessionExpiredAt),
        });
      }

      setSessionLoadStateBySlug((prev) => ({ ...prev, [boxSlug]: "loaded" }));
      return data;
    } catch (error) {
      setSessionLoadStateBySlug((prev) => ({ ...prev, [boxSlug]: "loaded" }));
      return { active: false, error: error?.message || "SESSION_LOAD_FAILED" };
    }
  }, [clearBoxSession, saveVerifiedSession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/box-management/box-sessions/active`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) {return;}

        const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
        sessions.forEach((item) => {
          if (item?.box?.slug && item?.session) {
            saveVerifiedSession(item, { triggerEnterHint: false });
          }
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [saveVerifiedSession]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      Object.entries(boxesBySlug || {}).forEach(([slug, runtime]) => {
        if (runtime?.session && !isActiveSession(runtime.session)) {
          expireBoxSession(slug);
        }
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [boxesBySlug, expireBoxSession]);

  const value = useMemo(() => ({
    boxesBySlug,
    currentFlowboxSlug,
    lastVisitedFlowboxSlug,
    sessionLoadStateBySlug,
    uiHintsBySlug,
    saveBoxBootstrap,
    markFlowboxVisited,
    clearCurrentFlowboxSlug,
    saveVerifiedSession,
    saveDiscoverSnapshot,
    patchDiscoverSnapshot,
    clearDiscoverSnapshot,
    clearBoxSession,
    expireBoxSession,
    getBoxRuntime,
    getDiscoverSnapshot,
    getActiveSessionForSlug,
    ensureBoxSession,
    consumeEnterHint,
    markThreeMinWarningShown,
  }), [
    boxesBySlug,
    currentFlowboxSlug,
    lastVisitedFlowboxSlug,
    sessionLoadStateBySlug,
    uiHintsBySlug,
    saveBoxBootstrap,
    markFlowboxVisited,
    clearCurrentFlowboxSlug,
    saveVerifiedSession,
    saveDiscoverSnapshot,
    patchDiscoverSnapshot,
    clearDiscoverSnapshot,
    clearBoxSession,
    expireBoxSession,
    getBoxRuntime,
    getDiscoverSnapshot,
    getActiveSessionForSlug,
    ensureBoxSession,
    consumeEnterHint,
    markThreeMinWarningShown,
  ]);

  return (
    <FlowboxSessionContext.Provider value={value}>
      {children}
    </FlowboxSessionContext.Provider>
  );
}
