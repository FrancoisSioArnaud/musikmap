// frontend/src/components/UserProfile/Library.js
import React, { useState, useEffect, useRef, useContext, useCallback } from "react";
import { UserContext } from "../UserContext";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/** Nouveau: on réutilise le composant générique */
import Deposit from "../Common/Deposit";

/** Format relatif FR (ex: "il y a 3 heures") */
function formatRelativeFr(isoDateString) {
  if (!isoDateString) return "";
  const d = new Date(isoDateString);
  if (isNaN(d)) return "";
  const now = new Date();
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffSec / 3600);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDay = Math.round(diffSec / 86400);
  if (Math.abs(diffDay) < 7) return rtf.format(diffDay, "day");
  const diffWeek = Math.round(diffDay / 7);
  if (Math.abs(diffWeek) < 5) return rtf.format(diffWeek, "week");
  const diffMonth = Math.round(diffDay / 30);
  if (Math.abs(diffMonth) < 12) return rtf.format(diffMonth, "month");
  const diffYear = Math.round(diffDay / 365);
  return rtf.format(diffYear, "year");
}

export default function Library() {
  const { user } = useContext(UserContext);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [limit] = useState(10);

  const loadingRef = useRef(false);

  const fetchSessions = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/box-management/discovered-songs?limit=${limit}&offset=${nextOffset}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        const newSessions = Array.isArray(data?.sessions) ? data.sessions : [];
        setSessions((prev) => [...prev, ...newSessions]);
        setHasMore(Boolean(data?.has_more));
        setNextOffset(typeof data?.next_offset === "number" ? data.next_offset : nextOffset + newSessions.length);
      } else {
        console.error("HTTP", res.status, data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [limit, nextOffset, hasMore]);

  useEffect(() => {
    setSessions([]);
    setHasMore(true);
    setNextOffset(0);
  }, []);

  useEffect(() => {
    if (sessions.length === 0 && hasMore && !loadingRef.current) {
      fetchSessions();
    }
  }, [sessions.length, hasMore, fetchSessions]);

  useEffect(() => {
    function onScroll() {
      if (loadingRef.current || !hasMore) return;
      const nearBottom = window.innerHeight + window.scrollY >= (document.body.offsetHeight - 200);
      if (nearBottom) {
        fetchSessions();
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [fetchSessions, hasMore]);

  if (!sessions.length && !hasMore && !loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Vous n'avez pas encore découvert de chansons.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: "grid", gap: 4 }}>
      {sessions.map((sess) => {
        const headerText = `Box : ${sess?.box?.name ?? "Inconnue"} · ${formatRelativeFr(sess?.started_at)}`;

        return (
          <Box key={sess.session_id} sx={{ display: "grid", gap: 1, mb: 4 }}>
            {/* Header de session */}
            <Typography
              variant="h6"
              component="h2"
              sx={{ mb: 1, cursor: "default" }}
            >
              {headerText}
            </Typography>

            {/* Dépôts de la session */}
            <Box sx={{ display: "grid", gap: 1.5 }}>
              {Array.isArray(sess?.deposits) && sess.deposits.map((d, idx) => {
                const t = (d?.type || "").toLowerCase();
                const isMain = t === "main";

                return (
                  <Deposit
                    key={`${sess.session_id}-${idx}`}
                    dep={d}
                    user={user}
                    // Aucun reveal dans Library: tout est déjà révélé
                    variant={isMain ? "main" : "list"}
                    showDate={false}
                    showUser={true}
                    fitContainer={true}
                  />
                );
              })}
            </Box>
          </Box>
        );
      })}

      {/* Loader simple */}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}
