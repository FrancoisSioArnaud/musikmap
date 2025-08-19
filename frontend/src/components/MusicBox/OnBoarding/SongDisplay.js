import * as React from "react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { getCookie } from "../../Security/TokensUtils";

// map id -> provider label
const PLATFORM_MAP = { 1: "spotify", 2: "deezer" };

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

  // total points (succès "Total")
  const totalPoints = useMemo(() => {
    const item = succ.find((s) => (s?.name || "").toLowerCase() === "total");
    return item?.points ?? 0;
  }, [succ]);

  const displaySuccesses = useMemo(
    () => succ.filter((s) => (s?.name || "").toLowerCase() !== "total"),
    [succ]
  );

  // -------- Modal Play : pour n'importe quel dépôt --------
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

  // -------- Agrégateur : provider = song.platform_id --------
  async function getPlateformLink(song) {
    const csrftoken = getCookie("csrftoken");
    const selectedProvider = PLATFORM_MAP[song?.platform_id] || "spotify";

    const res = await fetch("../api_agg/aggreg", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        song: song?.url,         // URL du morceau
        platform: selectedProvider,
      }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    window.open(data);
  }

  const copySongText = async (song) => {
    const text = `${song?.title ?? ""} - ${song?.artist ?? ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié dans le presse-papiers !");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Copié dans le presse-papiers !");
    }
  };

  // -------- Révéler (GET /box-management/revealSong) --------
  async function revealSong(idx) {
    const dep = deposits[idx];
    const cost = dep?.song?.cost;
    const songId = dep?.song?.id;
    if (!songId || !cost) return;

    const csrftoken = getCookie("csrftoken");
    const url = `/box-management/revealSong?song_id=${encodeURIComponent(
      songId
    )}&cost=${encodeURIComponent(cost)}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "X-CSRFToken": csrftoken },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json(); // { song: { title, artist, url, platform_id } }

      // met à jour le dépôt i (on garde img_url, cost, id, etc.)
      const updated = [...deposits];
      const prevSong = updated[idx]?.song || {};
      updated[idx] = {
        ...updated[idx],
        song: {
          ...prevSong,
          title: data?.song?.title ?? prevSong.title,
          artist: data?.song?.artist ?? prevSong.artist,
          url: data?.song?.url ?? prevSong.url,
          platform_id: data?.song?.platform_id ?? prevSong.platform_id,
        },
      };
      setDispDeposits(updated);
    } catch (e) {
      console.error(e);
      alert("Impossible de révéler ce titre pour le moment.");
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
        const isRevealed = Boolean(s?.title && s?.artist);

        return (
          <Card key={idx} sx={{ p: 2 }}>
            {/* 1) deposit_date — ATTEND du texte "naturel" depuis Django */}
            <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {dep?.deposit_date}
            </Box>

            {/* 2) deposit_user */}
            <Box
              id="deposit_user"
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, cursor: "pointer" }}
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
              // ======= PREMIER DÉPÔT : image full width + bloc titre/artiste à gauche et Play à droite =======
              <Box id="deposit_song" sx={{ display: "grid", gap: 1, mb: 2 }}>
                {/* Image plein largeur (ratio 16/9, flou si non révélé) */}
                <Box
                  sx={{
                    width: "100%",
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
                >
                  {s?.img_url && (
                    <Box
                      component="img"
                      src={s.img_url}
                      alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                      sx={{
                        width: "100%",
                        aspectRatio: "16/9",
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
                        <Typography component="h1" variant="h5" noWrap sx={{ fontWeight: 700 }}>
                          {s.title}
                        </Typography>
                        <Typography component="h2" variant="subtitle1" color="text.secondary" noWrap>
                          {s.artist}
                        </Typography>
                      </>
                    )}
                  </Box>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => isRevealed ? openPlayFor(s) : null}
                    disabled={!isRevealed}
                  >
                    Play
                  </Button>
                </Box>
              </Box>
            ) : (
              // ======= AUTRES DÉPÔTS : image à gauche, à droite (titre h2, artiste h3, play) quand révélé =======
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
                {/* Image à gauche, blur si non révélé */}
                <Box
                  sx={{
                    width: 140,
                    height: 140,
                    borderRadius: 1,
                    overflow: "hidden",
                  }}
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

                {/* Titre / Artiste / Play (quand révélé) */}
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  {isRevealed && (
                    <>
                      <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700 }}>
                        {s.title}
                      </Typography>
                      <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap>
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

            {/* 4) deposit_interact — toujours sous deposit_song */}
            <Box id="deposit_interact" sx={{ mt: 0 }}>
              {idx === 0 ? (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button variant="contained" onClick={() => openPlayFor(s)} disabled={!isRevealed}>
                    Play
                  </Button>
                  <Button variant="outlined" onClick={() => setSuccessOpen(true)}>
                    Points gagnés : {totalPoints}
                  </Button>
                </Box>
              ) : isRevealed ? (
                <Button variant="contained" onClick={() => openPlayFor(s)} size="large">
                  Play
                </Button>
              ) : (
                <Button variant="contained" onClick={() => revealSong(idx)} size="large">
                  Révéler — {s?.cost ?? "?"}
                </Button>
              )}
            </Box>
          </Card>
        );
      })}

      {/* ---- Modal PLAY ---- */}
      {playOpen && playSong && (
        <Overlay onClose={closePlay}>
          <Card sx={{ width: "100%", maxWidth: 500, borderRadius: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" sx={{ mr: 2 }} noWrap>
                  {playSong?.title || "Titre"} — {playSong?.artist || "Artiste"}
                </Typography>
                <Button onClick={closePlay} title="Fermer">
                  ×
                </Button>
              </Box>

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="contained" onClick={() => getPlateformLink(playSong)}>
                  Spotify
                </Button>
                <Button variant="contained" onClick={() => getPlateformLink(playSong)}>
                  Deezer
                </Button>
                <Button variant="outlined" onClick={() => copySongText(playSong)}>
                  Copier le nom de la chanson
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Overlay>
      )}

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
