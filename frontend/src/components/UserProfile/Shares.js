// frontend/src/components/UserProfile/Shares.js
import React, { useCallback, useEffect, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // "error" | null
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setItems([]);
    setLoading(false);
    setError(null);
    setHasMore(false);
    setNextOffset(0);
    setLoadedOnce(false);
  }, []);

  // Reset when username changes (and abort in-flight)
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    reset();
  }, [username, reset]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    if (!username) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
        return;
      }

      setItems((prev) => [...prev, ...newItems]);
      setHasMore(has_more);
      setNextOffset(next_offset);
      setLoadedOnce(true);
      setLoading(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error(e);
      setError("error");
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [loading, username, nextOffset]);

  // Auto-load first page
  useEffect(() => {
    if (!autoLoad) return;
    if (loadedOnce) return;
    loadMore();
  }, [autoLoad, loadedOnce, loadMore]);

  return (
    <>
      {error ? (
        <Typography sx={{ p: 2 }}>Erreur lors du chargement des partages.</Typography>
      ) : !loadedOnce && loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress />
        </Box>
      ) : !items.length ? (
        <Typography sx={{ p: 5 }}>Aucun partage pour l’instant.</Typography>
      ) : (
        <Box sx={{ display: "grid", gap: 5, p: 5, backgroundColor: "rgb(123, 213, 40)" }}>
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
        </Box>
      )}


      {/* Load more */}
      <Box sx={{ display: "flex", justifyContent: "center", pb: 6 }}>
        {hasMore ? (
          <Button variant="contained" onClick={loadMore} disabled={loading}>
            {loading ? <CircularProgress size={22} /> : "Charger plus"}
          </Button>
        ) : loadedOnce && items.length ? (
          <Typography sx={{ color: "text.secondary" }}>Fin des partages</Typography>
        ) : null}
      </Box>
    </>
  );
}
