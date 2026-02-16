// frontend/src/components/UserProfile/Shares.js
import React, { useCallback, useEffect, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import Deposit from "../Common/Deposit";

/* ===========================
   API helper
   =========================== */
async function fetchUserShares(username, { limit, offset }, signal) {
  if (!username) {
    return { ok: false, status: 400, items: [], has_more: false, next_offset: 0 };
  }

  const url = `/box-management/user-deposits?username=${encodeURIComponent(
    username
  )}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("user-deposits HTTP", res.status, data);
    return { ok: false, status: res.status, items: [], has_more: false, next_offset: offset };
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    ok: true,
    status: res.status,
    items,
    has_more: Boolean(data?.has_more),
    next_offset: typeof data?.next_offset === "number" ? data.next_offset : offset + items.length,
  };
}

/* ===========================
   Shares page component
   =========================== */
export default function Shares({ username, user, autoLoad }) {
  const LIMIT = 20;

  const [items, setItems] = useState([]);
  const [error, setError] = useState(null); // "error" | null
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const abortRef = useRef(null);
  const loadingRef = useRef(false);

  // Reset when username changes
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();

    setItems([]);
    setError(null);
    setLoading(false);
    setHasMore(true);
    setNextOffset(0);
    setLoadedOnce(false);

    loadingRef.current = false;
  }, [username]);

  const loadMore = useCallback(async () => {
    if (!autoLoad) return; // respecte ton param
    if (loadingRef.current || !hasMore) return;
    if (!username) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { ok, items: newItems, has_more, next_offset } = await fetchUserShares(
        username,
        { limit: LIMIT, offset: nextOffset },
        controller.signal
      );

      if (controller.signal.aborted) return;

      if (!ok) {
        setError("error");
        setLoading(false);
        setLoadedOnce(true);
        loadingRef.current = false;
        return;
      }

      setItems((prev) => [...prev, ...newItems]);
      setHasMore(Boolean(has_more));
      setNextOffset(typeof next_offset === "number" ? next_offset : nextOffset + newItems.length);
      setLoadedOnce(true);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error(e);
      setError("error");
      setLoadedOnce(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [autoLoad, hasMore, username, nextOffset]);

  // First load
  useEffect(() => {
    if (!autoLoad) return;
    if (loadedOnce) return;
    loadMore();
  }, [autoLoad, loadedOnce, loadMore]);

  // Infinite scroll (same spirit as Library)
  useEffect(() => {
    if (!autoLoad) return;

    function onScroll() {
      if (loadingRef.current || !hasMore) return;
      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200;
      if (nearBottom) loadMore();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [autoLoad, hasMore, loadMore]);

  if (error) {
    return <Typography sx={{ p: 2 }}>Erreur lors du chargement des partages.</Typography>;
  }

  if (!loadedOnce && loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!items.length && loadedOnce && !loading) {
    return <Typography sx={{ p: 4 }}>Aucun partage pour l’instant.</Typography>;
  }

  return (
    <>
      <Box sx={{ display: "grid", gap: 4, p: 4}}>
        {items.map((it) => (
          <Deposit
            key={it?.public_key ?? it?.id ?? JSON.stringify(it)}
            dep={it}
            user={user}
            variant="list"
            fitContainer={true}
            showUser={false}
            allowReact={false}
          />
        ))}

        {/* Loader en bas comme Library */}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        )}
      </Box>

      {/* IMPORTANT: pas de "Fin des partages" */}
    </>
  );
}
