// src/components/YourPath/SongDisplay.jsx
import * as React from "react";
import { useState, useEffect, useContext } from "react";
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
import { UserContext } from "../../UserContext";
import { getCookie } from "../../Security/TokensUtils";
import { getUserDetails } from "../../UsersUtils";
import { checkUserStatus } from "../../UsersUtils";

/**
 * Affiche les 10 dépôts précédents d'une boîte.
 * @param {Array}  dispDeposits   - Tableau des dépôts (1er: complet, suivants: song.id/img_url/cost).
 * @param {Array|Object} achievements - Succès (parfois tableau, parfois objet).
 */
export default function SongDisplay({ dispDeposits = [], achievements = [] }) {
  const navigate = useNavigate();
  const { setUser, setIsAuthenticated } = useContext(UserContext);

  // Copie locale, pour pouvoir "révéler" un dépôt sans muter les props
  const [items, setItems] = useState(dispDeposits);
  useEffect(() => setItems(dispDeposits || []), [dispDeposits]);

  // Normalisation des achievements (accepte array ou objet)
  const achList = Array.isArray(achievements)
    ? achievements
    : Object.values(achievements || {});
  const totalAch = achList.find((a) => (a?.name || "").toLowerCase() === "total");
  const totalPoints = totalAch?.points ?? 0;
  const achWithoutTotal = achList.filter(
    (a) => (a?.name || "").toLowerCase() !== "total"
  );

  // Modale "Play" (pour le 1er dépôt ou pour un dépôt révélé)
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null); // { title, artist, url, platform_id }

  // Modale "Succès"
  const [achOpen, setAchOpen] = useState(false);

  // Ouverture modale Play
  const openPlayModal = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };
  const closePlayModal = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  // Copier "Titre - Artiste" dans le presse-papiers
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

  /**
   * Ouvre le lien agrégateur pour la plateforme de la chanson.
   * 👉 On utilise song.platform_id comme demandé.
   */
  async function getPlateformLink(song) {
    if (!song) return;
    const selectedProvider = song.platform_id; // ✅ demandé
    const csrftoken = getCookie("csrftoken");

    const res = await fetch("/api_agg/aggreg", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        song: song.url, // on envoie l'URL du morceau
        platform: selectedProvider, // id/platform_id (ton backend agrégateur doit l'accepter)
      }),
    });
    if (!res.ok) return console.error("Erreur API aggreg:", res.status);
    const data = await res.json();
    window.open(data); // l'API renvoie une URL à ouvrir
  }

  /**
   * Révélation d'un dépôt (pour les 9 suivants).
   * GET /box-management/revealSong?song_id=...&cost=...
   * Remplace dans items[index] les infos song par celles retournées.
   */
  async function revealSong(cost, songId, indexInList) {
    try {
      const csrftoken = getCookie("csrftoken");
      const url = `/box-management/revealSong?song_id=${encodeURIComponent(
        songId
      )}&cost=${encodeURIComponent(cost)}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { "X-CSRFToken": csrftoken },
      });
      if (!res.ok) {
        console.error("Erreur revealSong", res.status);
        return;
      }
      const data = await res.json(); // { song: { title, artist, url, platform_id } }

      setItems((prev) =>
        prev.map((it, i) =>
          i === indexInList
            ? {
                ...it,
                song: {
                  ...it.song,
                  title: data.song?.title,
                  artist: data.song?.artist,
                  url: data.song?.url,
                  platform_id: data.song?.platform_id,
                },
              }
            : it
        )
      );
    } catch (e) {
      console.error(e);
    }
  }

  // Rendu du 1er dépôt (complet)
  const renderFirstDeposit = (dep) => {
    if (!dep) return null;
    const dateStr = dep.deposit_date;
    const user = dep.user;
    const song = dep.song;

    return (
      <Card sx={{ mb: 2, p: 2 }}>
        {/* 1) deposit_date */}
        <Box id="deposit_date" sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {dateStr}
          </Typography>
        </Box>

        {/* 2) deposit_user (cliquable vers /profile/:id) */}
        <Box
          id="deposit_user"
          onClick={() => user?.id && navigate("/profile/" + user.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 2,
            cursor: user?.id ? "pointer" : "default",
          }}
        >
          <Avatar
            src={user?.profile_pic_url || undefined}
            alt={user?.name || "user"}
            sx={{ width: 36, height: 36 }}
          />
          <Typography variant="subtitle2">{user?.name || "Anonyme"}</Typography>
        </Box>

        {/* 3) deposit_song */}
        <Box
          id="deposit_song"
          sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}
        >
          <CardMedia
            component="img"
            image={song?.img_url || undefined}
            alt={`${song?.title || ""} - ${song?.artist || ""}`}
            sx={{ width: 96, height: 96, objectFit: "cover", borderRadius: 1 }}
          />
          <Box>
            <Typography variant="h6" noWrap>
              {song?.title}
            </Typography>
            <Typography variant="subtitle2" color="text.secondary" noWrap>
              {song?.artist}
            </Typography>
            <Button
              variant="contained"
              sx={{ mt: 1 }}
              onClick={() => openPlayModal(song)}
            >
              Play
            </Button>
          </Box>
        </Box>

        {/* 4) deposit_interact */}
        <Box id="deposit_interact" sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={() => setAchOpen(true)}>
            +{totalPoints} points
          </Button>
        </Box>
      </Card>
    );
  };

  // Rendu d'un dépôt suivant (révélé ou non)
  const renderOtherDeposit = (dep, index) => {
    const user = dep.user;
    const song = dep.song;
    const revealed = !!song?.title; // si title présent => déjà révélé

    return (
      <Card key={index} sx={{ mb: 2, p: 2 }}>
        {/* 1) deposit_date */}
        <Box id="deposit_date" sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {dep.deposit_date}
          </Typography>
        </Box>

        {/* 2) deposit_user */}
        <Box
          id="deposit_user"
          onClick={() => user?.id && navigate("/profile/" + user.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 2,
            cursor: user?.id ? "pointer" : "default",
          }}
        >
          <Avatar
            src={user?.profile_pic_url || undefined}
            alt={user?.name || "user"}
            sx={{ width: 36, height: 36 }}
          />
          <Typography variant="subtitle2">{user?.name || "Anonyme"}</Typography>
        </Box>

        {/* 3) deposit_song */}
        <Box
          id="deposit_song"
          sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}
        >
          <CardMedia
            component="img"
            image={song?.img_url || undefined}
            alt="cover"
            sx={{
              width: 96,
              height: 96,
              objectFit: "cover",
              borderRadius: 1,
              filter: revealed ? "none" : "blur(6px)", // flou si non révélé
              transition: "filter .2s ease",
            }}
          />
          <Box>
            {revealed ? (
              <>
                <Typography variant="h6" noWrap>
                  {song?.title}
                </Typography>
                <Typography variant="subtitle2" color="text.secondary" noWrap>
                  {song?.artist}
                </Typography>
                <Button
                  variant="contained"
                  sx={{ mt: 1 }}
                  onClick={() => openPlayModal(song)}
                >
                  Play
                </Button>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Titre masqué — clique sur Révéler
              </Typography>
            )}
          </Box>
        </Box>

        {/* 4) deposit_interact */}
        <Box id="deposit_interact" sx={{ display: "flex", gap: 1 }}>
          {revealed ? (
            <Button variant="outlined" disabled>
              Révélé
            </Button>
          ) : (
            <Button
              variant="outlined"
              onClick={() => revealSong(song?.cost, song?.id, index)}
            >
              Révéler — {song?.cost}
            </Button>
          )}
        </Box>
      </Card>
    );
  };

  // Effets annexes existants (si besoin d’info user côté contexte)
  useEffect(() => {
    checkUserStatus(setUser, (auth) => setIsAuthenticated?.(auth));
  }, [setUser, setIsAuthenticated]);

  // --- Rendu global ---
  if (!items?.length) {
    return <Typography>Aucun dépôt à afficher.</Typography>;
  }

  const first = items[0] || null;
  const rest = items.slice(1);

  return (
    <Box sx={{ width: "100%", maxWidth: 800, mx: "auto" }}>
      {/* 1er dépôt (complet) */}
      {renderFirstDeposit(first)}

      {/* Les 9 suivants */}
      {rest.map((dep, i) => renderOtherDeposit(dep, i + 1))}

      {/* === Modale Play === */}
      {playOpen && (
        <Box
          onClick={closePlayModal}
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
          <Card onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 420 }}>
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="h6" gutterBottom noWrap>
                {playSong?.title} — {playSong?.artist}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                {/* Bouton fermer (icône croix simplifiée via "×") */}
                <Button variant="outlined" onClick={closePlayModal} aria-label="Fermer">
                  ×
                </Button>
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
        </Box>
      )}

      {/* === Modale Succès === */}
      {achOpen && (
        <Box
          onClick={() => setAchOpen(false)}
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
          <Card onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 480 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Tes succès
              </Typography>
              <List sx={{ p: 0 }}>
                {achWithoutTotal.map((ach, idx) => (
                  <ListItem key={idx} disableGutters divider>
                    <ListItemText
                      primary={ach?.name}
                      secondary={ach?.desc}
                      primaryTypographyProps={{ fontWeight: 600 }}
                    />
                    <Typography variant="body2">+{ach?.points}</Typography>
                  </ListItem>
                ))}
              </List>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                <Button onClick={() => setAchOpen(false)}>Fermer</Button>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}
