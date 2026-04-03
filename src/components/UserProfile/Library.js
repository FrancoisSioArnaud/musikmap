// frontend/src/components/UserProfile/Library.js
import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";

import Deposit from "../Common/Deposit";
import { formatRelativeTime } from "../Utils/time";

export default function Library() {
  const navigate = useNavigate();
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
        <Typography>
          Vous n&apos;avez pas encore découvert de chansons.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 5, p: 5 }}>
      {sessions.map((sess) => {
        const sessionType =
          sess?.session_type === "profile" ? "profile" : "box";
        const profileUser = sess?.profile_user || null;
        const profileLabel =
          profileUser?.display_name ||
          profileUser?.username ||
          "profil inconnu";
        const canOpenProfile = Boolean(profileUser?.username);

        return (
          <Box key={sess.session_id} sx={{ display: "grid" }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                m: "16px",
                gap: 0.5,
              }}
            >
              <Typography
                variant="h5"
                component="h2"
                sx={{ textAlign: "center" }}
              >
                Découverte {formatRelativeTime(sess?.started_at)}
              </Typography>

              {sessionType === "profile" ? (
                <Typography
                  variant="h5"
                  component="h2"
                  sx={{
                    textAlign: "center",
                  }}
                >
                  sur le profil de{" "}
                  <Box
                    component="span"
                    role={canOpenProfile ? "button" : undefined}
                    tabIndex={canOpenProfile ? 0 : undefined}
                    onClick={() => {
                      if (!canOpenProfile) return;
                      navigate(`/profile/${profileUser.username}`);
                    }}
                    onKeyDown={(event) => {
                      if (!canOpenProfile) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/profile/${profileUser.username}`);
                      }
                    }}
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      cursor: canOpenProfile ? "pointer" : "default",
                      verticalAlign: "middle",
                    }}
                  >
                    <Box component="span">{profileLabel}</Box>
                    <ArrowForwardIosIcon sx={{ fontSize: "0.9em" }} />
                  </Box>
                </Typography>
              ) : (
                <Typography
                  variant="h5"
                  component="h2"
                  sx={{ textAlign: "center" }}
                >
                  à {sess?.box?.name ?? "Inconnue"}
                </Typography>
              )}
            </Box>

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
                      context={sessionType === "profile" ? "profile" : "box"}
                    />
                  );
                })}
            </Box>
          </Box>
        );
      })}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}
