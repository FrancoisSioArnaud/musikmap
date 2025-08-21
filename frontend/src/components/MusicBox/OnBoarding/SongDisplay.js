import * as React from "react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { getCookie } from "../../Security/TokensUtils";
import PlayModal from "../../Common/PlayModal";

export default function SongDisplay({
  dispDeposits,
  setDispDeposits,
  achievements,
  setAchievement,
}) {
  const navigate = useNavigate();

  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );
  const succ = useMemo(
    () => (Array.isArray(achievements) ? achievements : []),
    [achievements]
  );

  const [successOpen, setSuccessOpen] = useState(false);

  const totalPoints = useMemo(() => {
    const item = succ.find((s) => (s?.name || "").toLowerCase() === "total");
    return item?.points ?? 0;
  }, [succ]);

  const displaySuccesses = useMemo(
    () => succ.filter((s) => (s?.name || "").toLowerCase() !== "total"),
    [succ]
  );

  // Modal Play
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const openPlayFor = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };
  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  // Découvrir (GET /box-management/revealSong) + enregistrer la découverte "revealed"
  async function discoverSong(idx) {
    const dep = deposits[idx];
    const cost = dep?.song?.cost;
    const songId = dep?.song?.id;
    const depositId = dep?.deposit_id; // fourni par le backend GetBox.post
    if (!songId || !cost) return;

    const csrftoken = getCookie("csrftoken");
    const url = `/box-management/revealSong?song_id=${encodeURIComponent(
      songId
    )}&cost=${encodeURIComponent(cost)}`;

    try {
      // 1) Révélation
      const res = await fetch(url, {
        method: "GET",
        headers: { "X-CSRFToken": csrftoken },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // Attendu: { song: { title, artist, spotify_url, deezer_url } }
      const data = await res.json();

      // 2) MAJ locale du dépôt (révélé)
      const updated = [...deposits];
      const prevSong = updated[idx]?.song || {};
      updated[idx] = {
        ...updated[idx],
        already_discovered: true,         // pour masquer le bouton et forcer l’affichage révélé
        discovered_at: "à l'instant",     // pour l’étiquette demandée
        song: {
          ...prevSong,
          title: data?.song?.title ?? prevSong.title,
          artist: data?.song?.artist ?? prevSong.artist,
          spotify_url: data?.song?.spotify_url ?? prevSong.spotify_url,
          deezer_url: data?.song?.deezer_url ?? prevSong.deezer_url,
        },
      };
      setDispDeposits(updated);

      // 3) Enregistrer côté serveur la découverte "revealed"
      if (depositId) {
        await fetch("/box-management/discovered-songs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
          },
          body: JSON.stringify({
            deposit_id: depositId,
            discovered_type: "revealed",
          }),
        });
        // silencieux en cas d'échec
      }
    } catch (e) {
      console.error(e);
      alert("Impossible de découvrir ce titre pour le moment.");
    }
  }

  if (deposits.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Aucun dépôt à afficher.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {deposits.map((dep, idx) => {
        const u = dep?.user;
        const s = dep?.song || {};
        const already = !!dep?.already_discovered;
        const isRevealed = already || Boolean(s?.title && s?.artist);

        return (
          <Card key={idx} sx={{ p: 2 }}>
            {/* 1) deposit_date */}
            <Box
              id="deposit_date"
              sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}
            >
              {dep?.deposit_date}
            </Box>

            {/* 2) deposit_user */}
            <Box
              id="deposit_user"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                cursor: u?.id != null ? "pointer" : "default",
              }}
              onClick={() => {
                if (u?.id != null) navigate("/profile/" + u.id);
              }}
            >
              <Avatar
                src={u?.profile_pic_url || undefined}
                alt={u?.name || "Anonyme"}
                sx={{ width: 40, height: 40 }}
              />
              <Typography>{u?.name || "Anonyme"}</Typography>
            </Box>

            {/* 3) deposit_song */}
            {idx === 0 ? (
              // ======= PREMIER DÉPÔT =======
              <Box id="deposit_song" sx={{ display: "grid", gap: 1, mb: 2 }}>
                {/* Image carré plein largeur */}
                <Box sx={{ width: "100%", borderRadius: 1, overflow: "hidden" }}>
                  {s?.img_url && (
                    <Box
                      component="img"
                      src={s.img_url}
                      alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                      sx={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        objectFit: "cover",
                        display: "block",
                        filter: isRevealed ? "none" : "blur(6px) brightness(0.9)",
                      }}
                    />
                  )}
                </Box>

                {/* Ligne titre/artiste à gauche, Play à droite */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    {isRevealed && (
                      <>
                        <Typography
                          component="h1"
                          variant="h5"
                          noWrap
                          sx={{ fontWeight: 700, textAlign: "left" }}
                        >
                          {s.title}
                        </Typography>

                        <Typography
                          component="h2"
                          variant="subtitle1"
                          color="text.secondary"
                          noWrap
                          sx={{ textAlign: "left" }}
                        >
                          {s.artist}
                        </Typography>
                      </>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => (isRevealed ? openPlayFor(s) : null)}
                    disabled={!isRevealed}
                  >
                    Play
                  </Button>
                </Box>
              </Box>
            ) : (
              // ======= AUTRES DÉPÔTS =======
              <Box
                id="deposit_song"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: 2,
                  mb: 2,
                  alignItems: "center",
                }}
              >
                {/* Image carrée à gauche */}
                <Box
                  sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}
                >
                  {s?.img_url && (
                    <Box
                      component="img"
                      src={s.img_url}
                      alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        filter: isRevealed ? "none" : "blur(6px) brightness(0.9)",
                      }}
                    />
                  )}
                </Box>

                {/* Infos + Play (si révélé) */}
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}
                >
                  {isRevealed && (
                    <>
                      <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700 }}>
                        {s.title}
                      </Typography>

                      <Typography
                        component="h3"
                        variant="subtitle1"
                        color="text.secondary"
                        noWrap
                        sx={{ textAlign: "left" }}
                      >
                        {s.artist}
                      </Typography>
                      <Button
                        variant="contained"
                        size="large"
                        onClick={() => openPlayFor(s)}
                        sx={{ alignSelf: "flex-start", mt: 0.5 }}
                      >
                        Play
                      </Button>
                    </>
                  )}
                </Box>
              </Box>
            )}

            {/* 4) deposit_interact */}
            <Box id="deposit_interact" sx={{ mt: 0 }}>
              {idx === 0 ? (
                <Button variant="outlined" onClick={() => setSuccessOpen(true)}>
                  Points gagnés : {totalPoints}
                </Button>
              ) : !isRevealed ? (
                <Button variant="contained" onClick={() => discoverSong(idx)} size="large">
                  Découvrir — {s?.cost ?? "?"}
                </Button>
              ) : (
                // Affichage de la ligne "Découvert…" pour les secondaires uniquement
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {deposits[idx]?.discovered_at === "à l'instant"
                    ? "Découverte à l'instant"
                    : deposits[idx]?.discovered_at
                    ? `Découvert : ${deposits[idx].discovered_at}`
                    : null}
                </Typography>
              )}
            </Box>
          </Card>
        );
      })}

      {/* ---- Modal PLAY (commune) ---- */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

      {/* ---- Modal SUCCÈS ---- */}
      <SuccessModal
        successes={displaySuccesses}
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
      />
    </Box>
  );
}

function Overlay({ children, onClose }) {
  return (
    <Box
      onClick={onClose}
      sx={{
        position: "fixed",
        inset: 0,
        bgcolor: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        zIndex: 1300,
      }}
    >
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: "90vw" }}>
        {children}
      </Box>
    </Box>
  );
}

function SuccessModal({ open, successes, onClose }) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <Card sx={{ width: "100%", maxWidth: 520, borderRadius: 2 }}>
        <CardContent sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">Tes succès</Typography>
            <Button onClick={onClose}>Fermer</Button>
          </Box>

          <List sx={{ mt: 1 }}>
            {(!successes || successes.length === 0) && (
              <ListItem>
                <ListItemText primary="Aucun succès (hors Total)" />
              </ListItem>
            )}
            {successes?.map((ach, i) => (
              <ListItem key={i} divider>
                <ListItemText primary={ach.name} secondary={ach.desc} />
                <Typography variant="body2">+{ach.points}</Typography>
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Overlay>
  );
}
