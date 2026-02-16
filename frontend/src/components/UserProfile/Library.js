// frontend/src/components/UserProfile/Library.js
import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
} from "react";
import { UserContext } from "../UserContext";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/** Nouveau: on réutilise le composant générique */
import Deposit from "../Common/Deposit";
import { formatRelativeTime } from "../Utils/time";

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
      const res = await fetch(
        `/box-management/discovered-songs?limit=${limit}&offset=${nextOffset}`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );
      const data = await res.json();
      if (res.ok) {
        const rawSessions = Array.isArray(data?.sessions) ? data.sessions : [];

        // ✅ le back renvoie déjà la bonne shape (via _build_deposits_payload)
        setSessions((prev) => [...prev, ...rawSessions]);
        setHasMore(Boolean(data?.has_more));
        setNextOffset(
          typeof data?.next_offset === "number"
            ? data.next_offset
            : nextOffset + rawSessions.length
        );
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

  // Reset quand le composant est monté (utile si on revient plusieurs fois)
  useEffect(() => {
    setSessions([]);
    setHasMore(true);
    setNextOffset(0);
  }, []);

  // Premier chargement
  useEffect(() => {
    if (sessions.length === 0 && hasMore && !loadingRef.current) {
      fetchSessions();
    }
  }, [sessions.length, hasMore, fetchSessions]);

  // Infinite scroll
  useEffect(() => {
    function onScroll() {
      if (loadingRef.current || !hasMore) return;
      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.body.offsetHeight - 200;
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
        <Typography>Vous n&apos;avez pas encore découvert de chansons.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{display: "grid", gap: 4, p: 4}}>
      {sessions.map((sess) => {
        return (
          <Box key={sess.session_id} sx={{ display: "grid", mb: 4 }}>
            {/* Header de session */}
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                m: "16px",
              }}
            >
              <Typography
                variant="h5"
                component="h2"
                sx={{ textAlign: "center"}}
              >
                Découverte {formatRelativeTime(sess?.started_at)}
              </Typography>
              <Typography
                variant="h5"
                component="h2"
                sx={{ textAlign: "center" }}
              >
                à {sess?.box?.name ?? "Inconnue"}
              </Typography>

            </Box>

            {/* Dépôts de la session */}
            <Box sx={{ display: "grid", gap: 4 }}>
              {Array.isArray(sess?.deposits) &&
                sess.deposits.map((d, idx) => {
                  const t = (d?.type || "").toLowerCase();
                  const isMain = t === "main";

                  return (
                    <Deposit
                      key={`${sess.session_id}-${idx}`}
                      dep={d}
                      user={user}
                      variant={isMain ? "main" : "list"}
                      showDate={false}
                      showUser={true}
                      fitContainer={true}
                      allowReact={true}
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
