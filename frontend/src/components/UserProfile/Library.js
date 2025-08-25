// frontend/src/components/LibraryPage.js
import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import PlayModal from "../Common/PlayModal";

/** Format relatif FR (ex: "il y a 3 heures") */
function formatRelativeFr(isoDateString) {
  if (!isoDateString) return "";
  const d = new Date(isoDateString);
  if (isNaN(d)) return "";

  const now = new Date();
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000); // signé
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

/**
 * Page qui affiche les dépôts découverts de l'utilisateur (main & revealed).
 */
export default function Library() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const [items, setItems] = useState([]);        // liste de dépôts découverts
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

  async function getDiscovered() {
    const response = await fetch("../box-management/discovered-songs");
    const data = await response.json();
    if (response.ok) setItems(Array.isArray(data) ? data : []);
    else console.error(data);
  }

  useEffect(() => { getDiscovered(); }, []);

  if (!items.length) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Vous n'avez pas encore découvert de chansons.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: "grid", gap: 2 }}>
      {items.map((it, idx) => {
        const t = (it?.discovered_type || "").toLowerCase();
        const s = it?.song || {};
        const isMain = t === "main";

        // Date de découverte naturelle (fallback sur deposit_date si jamais)
        const discoveredIso = it?.discovered_at || null;
        const naturalDiscovered = formatRelativeFr(discoveredIso) || it?.deposit_date || "";

        // Utilisateur ayant déposé (si fourni par le backend)
        const u = it?.user;
        const canClickProfile = u?.id != null;

        return (
          <Box
            key={idx}
            sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2, background: "#fff" }}
          >
            {/* Date de découverte */}
            <Box
              sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}
              title={discoveredIso ? new Date(discoveredIso).toLocaleString("fr-FR") : undefined}
            >
              Découvert · {naturalDiscovered}
            </Box>

            {/* Utilisateur du dépôt (comme Discover) */}
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

            {/* --- MAIN layout (grand) --- */}
            {isMain ? (
              <Box sx={{ display: "grid", gap: 1, mb: 1 }}>
                {/* Image carré plein largeur */}
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

                {/* Titres alignés à gauche + bouton Play */}
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
              /* --- REVEALED layout (compact) --- */
              <Box sx={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 2, alignItems: "center" }}>
                {/* pochette 140x140 à gauche */}
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

                {/* infos + Play */}
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
      })}

      {/* Modale de lecture commune */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
    </Box>
  );
}
