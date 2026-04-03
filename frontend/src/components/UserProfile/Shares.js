import React, { useCallback, useEffect, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import Deposit from "../Common/Deposit";

async function fetchUserShares({ username, me, limit, offset }, signal) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (me) params.set("me", "1");
  else if (username) params.set("username", username);
  else return { ok: false, status: 400, items: [], has_more: false, next_offset: 0 };

  const url = `/box-management/user-deposits?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
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

export default function Shares({ username, me = false, user, autoLoad }) {
  const LIMIT = 20;

  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const abortRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    setItems([]);
    setError(null);
    setLoading(false);
    setHasMore(true);
    setNextOffset(0);
    setLoadedOnce(false);
    loadingRef.current = false;
  }, [username, me, user?.id]);

  const loadMore = useCallback(async () => {
    if (!autoLoad) return;
    if (loadingRef.current || !hasMore) return;
    if (!me && !username) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { ok, items: newItems, has_more, next_offset } = await fetchUserShares(
        { username, me, limit: LIMIT, offset: nextOffset },
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
  }, [autoLoad, hasMore, me, username, nextOffset]);

  useEffect(() => {
    if (!autoLoad) return;
    if (loadedOnce) return;
    loadMore();
  }, [autoLoad, loadedOnce, loadMore]);

  useEffect(() => {
    if (!autoLoad) return;

    function onScroll() {
      if (loadingRef.current || !hasMore) return;
      const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
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
      <Box sx={{ display: "grid", gap: 5, p: 5 }}>
        {items.map((it) => (
          <Deposit
            key={it?.public_key ?? it?.id ?? JSON.stringify(it)}
            dep={it}
            user={user}
            setDispDeposits={setItems}
            variant="list"
            fitContainer={true}
            showUser={false}
            context="profile"
          />
        ))}

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        )}
      </Box>
    </>
  );
}
