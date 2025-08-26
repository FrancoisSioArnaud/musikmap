// frontend/src/components/UserProfile/Library.js
import React, { useState, useEffect, useRef, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import CircularProgress from "@mui/material/CircularProgress";
import PlayModal from "../Common/PlayModal";

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
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [limit] = useState(10);

  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  const loadingRef = useRef(false);

  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

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

  const renderDepositCard = (it, idx) => {
    const t = (it?.type || "").toLowerCase();
    const s = it?.song || {};
    const isMain = t === "main";
    const u = it?.user;
    const canClickProfile = u?.id != null;

    return (
      <Box
        key={idx}
        sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2, background: "#fff" }}
      >
        {/* Suppression de "Découvert · ..." */}

        {/* Utilisateur du dépôt */}
        <Box
          id="deposit_user"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 2,
            cursor: canClickProfile ? "pointer" : "default",
          }}
          onClick={() => { if (canClickProfile) navigate("/profile/" + u.id); }}
        >
          <Avatar
            src={u?.profile_pic_url || undefined}
            alt={u?.name || "Anonyme"}
            sx={{ width: 40, height: 40 }}
          />
          <Typography>{u?.name || "Anonyme"}</Typography>
        </Box>

        {/* MAIN */}
        {isMain ? (
          <Box sx={{ display: "grid", gap: 1, mb: 1 }}>
            <Box sx={{ width: "100%", borderRadius: 1, overflow: "hidden" }}>
              {s?.img_url && (
                <Box
                  component="img"
                  src={s.img_url}
                  alt={`${s.title ?? ""} - ${s.artist ?? ""}`}
                  sx={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                />
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
              <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                <Typography component="h1" variant="h5" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
                  {s.title}
                </Typography>
                <Typography component="h2" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
                  {s.artist}
                </Typography>
              </Box>
              <Button variant="contained" size="large" onClick={() => openPlayFor(s)}>
                Play
              </Button>
            </Box>
          </Box>
        ) : (
          // REVEALED
          <Box sx={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 2, alignItems: "center" }}>
            <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
              {s?.img_url && (
                <Box
                  component="img"
                  src={s.img_url}
                  alt={`${s.title ?? ""} - ${s.artist ?? ""}`}
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
                {s.title}
              </Typography>
              <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
                {s.artist}
              </Typography>
              <Button variant="contained" size="large" onClick={() => openPlayFor(s)} sx={{ alignSelf: "flex-start", mt: 0.5 }}>
                Play
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    );
  };

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
              sx={{ mb: 1, cursor: "pointer" }}
              onClick={() => {/* TODO: lien vers /music-box/:box.url */}}
            >
              {headerText}
            </Typography>

            {/* Dépôts de la session */}
            <Box sx={{ display: "grid", gap: 1.5 }}> {/* 12px entre dépôts */}
              {Array.isArray(sess?.deposits) && sess.deposits.map((d, idx) => renderDepositCard(d, idx))}
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

      {/* Modale de lecture */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
    </Box>
  );
}
