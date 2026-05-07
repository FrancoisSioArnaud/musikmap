import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React, { useCallback, useEffect, useRef, useState } from "react";

import Deposit from "../../Common/Deposit";

export const DISCOVER_OLDER_DEPOSITS_LIMIT = 100;

const PAGE_SIZE = 25;
const END_MESSAGE = "Tu as vu toutes les chansons disponibles dans cette boîte.";
const LIMIT_MESSAGE = "Tu as atteint la limite de chansons affichées pour cette session.";
const LOAD_ERROR_MESSAGE = "Impossible de charger plus de chansons pour le moment.";

export default function OlderDepositsSection({
  boxSlug,
  deposits = [],
  nextCursor = null,
  hasMore = false,
  onDepositsLoaded,
  onSessionExpired,
  user,
}) {
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [observerUnavailable, setObserverUnavailable] = useState(false);

  const limitReached = deposits.length >= DISCOVER_OLDER_DEPOSITS_LIMIT;
  const canLoadMore = Boolean(hasMore && nextCursor && !limitReached);

  const loadNextPage = useCallback(async () => {
    if (!canLoadMore || loadingRef.current) {return;}
    loadingRef.current = true;
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch(
        `/box-management/box-older-deposits/?boxSlug=${encodeURIComponent(boxSlug)}&limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        {
          credentials: "include",
          headers: { Accept: "application/json" },
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 403 && data?.code === "BOX_SESSION_REQUIRED") {
          onSessionExpired?.();
          return;
        }
        throw new Error(data?.detail || LOAD_ERROR_MESSAGE);
      }

      onDepositsLoaded?.(data);
    } catch (error) {
      setLoadError(error?.message || LOAD_ERROR_MESSAGE);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [boxSlug, canLoadMore, nextCursor, onDepositsLoaded, onSessionExpired]);

  useEffect(() => {
    if (!canLoadMore) {return undefined;}
    if (!("IntersectionObserver" in window)) {
      setObserverUnavailable(true);
      return undefined;
    }

    setObserverUnavailable(false);
    const sentinel = sentinelRef.current;
    if (!sentinel) {return undefined;}

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadNextPage();
      }
    }, { rootMargin: "220px 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loadNextPage]);

  if (!deposits.length) {return null;}

  return (
    <Box id="older_deposit">
      <Box className="intro" sx={{ p: 4 }}>
        <Typography component="h2" variant="h3" sx={{ mt: 5 }}>
          Partages précédents
        </Typography>
        <Typography component="p" variant="body1">
          Ces chansons ont été déposées plus tôt dans cette boîte. Utilise tes
          points pour les révéler.
        </Typography>
      </Box>

      <Box id="older_deposits_list">
        {deposits.map((deposit, idx) => (
          <Deposit
            key={deposit.public_key || idx}
            dep={deposit}
            user={user}
            showPlay={true}
            showUser={true}
          />
        ))}

        <Box ref={sentinelRef} sx={{ minHeight: 24 }} aria-hidden="true" />

        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography component="span" variant="body2">
              Chargement de chansons précédentes…
            </Typography>
          </Box>
        ) : null}

        {loadError ? (
          <Alert severity="warning" sx={{ mx: 2, my: 2 }}>
            {loadError}
          </Alert>
        ) : null}

        {observerUnavailable && canLoadMore ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
            <Button variant="outlined" onClick={loadNextPage} disabled={loading}>
              Voir plus
            </Button>
          </Box>
        ) : null}

        {!loading && limitReached ? (
          <Typography component="p" variant="body1" sx={{ textAlign: "center", p: 2 }}>
            {LIMIT_MESSAGE}
          </Typography>
        ) : null}

        {!loading && !limitReached && !hasMore ? (
          <Typography component="p" variant="body1" sx={{ textAlign: "center", p: 2 }}>
            {END_MESSAGE}
          </Typography>
        ) : null}

        {!loading && canLoadMore && !observerUnavailable ? (
          <Box
            sx={{
              py: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              color: "text.primary",
              opacity: 0.72,
            }}
          >
            <KeyboardArrowDownIcon aria-hidden="true" />
            <Typography component="span" variant="body1">
              D’autres chansons arrivent en scrollant
            </Typography>
            <KeyboardArrowDownIcon aria-hidden="true" />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
