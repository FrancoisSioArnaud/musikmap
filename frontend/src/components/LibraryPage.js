import React, { useState, useEffect, useContext } from "react";
import { UserContext } from "./UserContext";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import PlayModal from "./Common/PlayModal";

/**
 * Page qui affiche les dépôts découverts de l'utilisateur (main & revealed).
 */
export default function LibraryPage() {
  const { user } = useContext(UserContext);

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
        <Typography variant="h5" gutterBottom>Ta bibliothèque de découvertes</Typography>
        <Typography>Vous n'avez pas encore découvert de chansons.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: "grid", gap: 2 }}>
      <Typography variant="h5" gutterBottom>Ta bibliothèque de découvertes</Typography>

      {items.map((it, idx) => {
        const t = (it?.discovered_type || "").toLowerCase();
        const s = it?.song || {};
        const isMain = t === "main";

        return (
          <Box key={idx} sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2, background: "#fff" }}>
            {/* Date + User (optionnel) */}
            <Box sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {it?.deposit_date}
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
