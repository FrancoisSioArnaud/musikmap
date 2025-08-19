import * as React from "react";
import { useState, useMemo, useContext, useEffect } from "react";
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
import { getUserDetails, checkUserStatus } from "../../UsersUtils";

/**
 * Page d’affichage des précédents dépôts d’une boîte.
 * NOTE: setDispDeposits = LISTE des dépôts (nom imposé par la consigne)
 *       setAchievements = SUCCÈS (tableau ou objet)
 */
export default function SongDisplay({ setDispDeposits, setAchievements }) {

  const navigate = useNavigate();
  const { setUser, setIsAuthenticated } = useContext(UserContext);

  // Normalise les props (robustesse si jamais ce n’est pas un tableau)
  const deposits = useMemo(
    () => (Array.isArray(setDispDeposits) ? setDispDeposits : []),
    [setDispDeposits]
  );
  const achievementsArr = useMemo(() => {
    if (Array.isArray(setAchievements)) return setAchievements;
    if (setAchievements && typeof setAchievements === "object") {
      return Object.values(setAchievements);
    }
    return [];
  }, [setAchievements]);

  // Récupère l’item "Total" pour afficher les points du dépôt
  const totalItem = useMemo(
    () => achievementsArr.find((a) => a?.name?.toLowerCase() === "total"),
    [achievementsArr]
  );
  const totalPoints = totalItem?.points ?? 0;
  const achievementsWithoutTotal = achievementsArr.filter(
    (a) => a?.name?.toLowerCase() !== "total"
  );

  // État modal pour PLAY du premier dépôt
  const [playOpen, setPlayOpen] = useState(false);

  // Provider sélectionné pour la modale du 1er dépôt (déduit de platform_id du morceau)
  const [selectedProvider, setSelectedProvider] = useState("spotify");

  // État modal pour “tes succès”
  const [achOpen, setAchOpen] = useState(false);

  // État local des morceaux révélés pour les 9 suivants (clé = song.id → valeurs = song complet)
  const [revealedSongs, setRevealedSongs] = useState({});

  // À l’arrivée sur la page, rafraîchit le statut utilisateur (optionnel)
  useEffect(() => {
    checkUserStatus(setUser, setIsAuthenticated);
  }, [setUser, setIsAuthenticated]);

  // -------------------------------
  // Helpers mapping provider
  // -------------------------------
  const platformMap = {
    1: "spotify",
    2: "deezer",
  };
  const mapPlatformIdToName = (platform_id) =>
    platformMap[platform_id] || "spotify";

  // -------------------------------
  // PLAY: construire le lien d’agrégation puis ouvrir dans un nouvel onglet
  // selectedProvider = song.platform_id du 1er dépôt
  // -------------------------------
  async function getPlatformLink() {
    const first = deposits[0];
    if (!first || !first.song) return;

    const song = first.song;
    const provider = mapPlatformIdToName(song.platform_id);
    setSelectedProvider(provider); // s’assure que c’est aligné avec le morceau

    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        // côté serveur, vous utilisiez déjà 'song' pour passer l’URL
        song: song.url,               // ✅ on envoie bien l’URL du morceau
        platform: provider,           // ✅ dérivé de platform_id
      }),
    };

    const res = await fetch("../api_agg/aggreg", requestOptions);
    if (!res.ok) return;
    const data = await res.json();
    window.open(data);
  }

  // -------------------------------
  // Copier "Titre - Artiste" dans le presse-papiers (1er dépôt)
  // -------------------------------
  async function copyFirstSongText() {
    const first = deposits[0];
    if (!first || !first.song) return;
    const text = `${first.song.title ?? ""} - ${first.song.artist ?? ""}`.trim();
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
  }

  // -------------------------------
  // Révéler un dépôt (parmi les 9 suivants)
  // GET /box-management/revealSong?cost=...&song_id=...
  // et mettre à jour l’affichage localement
  // -------------------------------
  async function revealSong(dep) {
    const csrftoken = getCookie("csrftoken");
    const url = `/box-management/revealSong?cost=${encodeURIComponent(
      dep.song?.cost ?? ""
    )}&song_id=${encodeURIComponent(dep.song?.id ?? "")}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-CSRFToken": csrftoken,
      },
    });
    if (!res.ok) {
      console.error("Reveal song failed", res.status);
      return;
    }
    const payload = await res.json();
    const revealed = payload?.song;
    if (!revealed) return;

    // Mémorise le morceau révélé pour ce song_id
    setRevealedSongs((prev) => ({
      ...prev,
      [dep.song.id]: revealed,
    }));
  }

  // ------------------------------------------------
  // Rendu
  // ------------------------------------------------
  if (!deposits.length) {
    return <Typography>Aucun dépôt à afficher.</Typography>;
  }

  const first = deposits[0];

  return (
    <Box sx={{ width: "100%", maxWidth: 920, mx: "auto", p: 2 }}>
      {/* ====== PREMIER DÉPÔT : affichage complet ====== */}
      <Card sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Dépôt le {new Date(first.deposit_date).toLocaleString()}
        </Typography>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          {/* 1) deposit_date (déjà affichée ci-dessus, mais on garde la sous-box dédiée si tu veux) */}
          <Card variant="outlined" id="deposit_date">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary">
                Date du dépôt
              </Typography>
              <Typography>{new Date(first.deposit_date).toLocaleString()}</Typography>
            </CardContent>
          </Card>

          {/* 2) deposit_user */}
          <Card
            variant="outlined"
            id="deposit_user"
            sx={{ cursor: "pointer" }}
            onClick={() => navigate("/profile/" + (first.user?.id ?? ""))}
          >
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Avatar
                src={first.user?.profile_pic_url || undefined}
                alt={first.user?.name || "Utilisateur"}
              />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Déposé par
                </Typography>
                <Typography>{first.user?.name ?? "Anonyme"}</Typography>
              </Box>
            </CardContent>
          </Card>

          {/* 3) deposit_song */}
          <Card variant="outlined" id="deposit_song" sx={{ gridColumn: "1 / -1" }}>
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <CardMedia
                component="img"
                image={first.song?.img_url || undefined}
                alt={`${first.song?.title || "Titre"} - ${first.song?.artist || "Artiste"}`}
                sx={{ width: 96, height: 96, objectFit: "cover", borderRadius: 1 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" noWrap>
                  {first.song?.title || "Titre inconnu"}
                </Typography>
                <Typography variant="subtitle2" color="text.secondary" noWrap>
                  {first.song?.artist || "Artiste inconnu"}
                </Typography>
              </Box>
              <Button variant="contained" onClick={() => setPlayOpen(true)}>
                ▶️ Play
              </Button>
            </CardContent>
          </Card>

          {/* 4) deposit_interact */}
          <Card variant="outlined" id="deposit_interact">
            <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Button variant="outlined" onClick={() => setAchOpen(true)}>
                {totalPoints} points
              </Button>
              <Typography variant="caption" color="text.secondary">
                (Points gagnés pour ce dépôt)
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Card>

      {/* ====== DÉPÔTS SUIVANTS (9 suivants) ====== */}
      <List sx={{ p: 0 }}>
        {deposits.slice(1).map((dep, idx) => {
          const revealed = dep.song?.id ? revealedSongs[dep.song.id] : null;
          const displayTitle = revealed?.title;
          const displayArtist = revealed?.artist;
          const displayUrl = revealed?.url;
          const displayPlatform = revealed?.platform_id;

          return (
            <ListItem key={idx} disableGutters sx={{ mb: 2 }}>
              <Card sx={{ p: 2, width: "100%" }}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 2,
                  }}
                >
                  {/* deposit_date */}
                  <Card variant="outlined" id="deposit_date">
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary">
                        Date du dépôt
                      </Typography>
                      <Typography>
                        {new Date(dep.deposit_date).toLocaleString()}
                      </Typography>
                    </CardContent>
                  </Card>

                  {/* deposit_user (cliquable profil) */}
                  <Card
                    variant="outlined"
                    id="deposit_user"
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate("/profile/" + (dep.user?.id ?? ""))}
                  >
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Avatar
                        src={dep.user?.profile_pic_url || undefined}
                        alt={dep.user?.name || "Utilisateur"}
                      />
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary">
                          Déposé par
                        </Typography>
                        <Typography>{dep.user?.name ?? "Anonyme"}</Typography>
                      </Box>
                    </CardContent>
                  </Card>

                  {/* deposit_song */}
                  <Card variant="outlined" id="deposit_song" sx={{ gridColumn: "1 / -1" }}>
                    <CardContent sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <Box sx={{ position: "relative", width: 96, height: 96, borderRadius: 1, overflow: "hidden" }}>
                        <CardMedia
                          component="img"
                          image={dep.song?.img_url || undefined}
                          alt="cover"
                          sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            // flou si pas encore révélé
                            filter: revealed ? "none" : "blur(8px)",
                          }}
                        />
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {revealed ? (
                          <>
                            <Typography variant="h6" noWrap>
                              {displayTitle}
                            </Typography>
                            <Typography variant="subtitle2" color="text.secondary" noWrap>
                              {displayArtist}
                            </Typography>
                          </>
                        ) : (
                          <>
                            <Typography variant="subtitle2" color="text.secondary">
                              Titre masqué
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Révèle pour découvrir ce titre
                            </Typography>
                          </>
                        )}
                      </Box>

                      {/* deposit_interact : bouton Révéler (si non révélé), sinon Play */}
                      {revealed ? (
                        <Button
                          variant="contained"
                          onClick={async () => {
                            // Ouvre la modale Play en calquant le provider sur le morceau révélé
                            setSelectedProvider(mapPlatformIdToName(displayPlatform));
                            setPlayOpen(true);
                          }}
                        >
                          ▶️ Play
                        </Button>
                      ) : (
                        <Button
                          variant="outlined"
                          onClick={() => revealSong(dep)}
                        >
                          Révéler ({dep.song?.cost ?? "?"})
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              </Card>
            </ListItem>
          );
        })}
      </List>

      {/* ====== MODALE PLAY (1er dépôt + révélés) ====== */}
      {playOpen && (
        <Box
          onClick={() => setPlayOpen(false)}
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
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="h6">Lecture</Typography>
                <Button onClick={() => setPlayOpen(false)}>✖</Button>
              </Box>

              {/* Spotify */}
              <Button
                variant="contained"
                sx={{ mr: 1, mb: 1 }}
                onClick={() => getPlatformLink()}
              >
                Spotify
              </Button>

              {/* Deezer */}
              <Button
                variant="contained"
                sx={{ mr: 1, mb: 1 }}
                onClick={() => {
                  // force Deezer si tu veux, sinon getPlatformLink utilisera platform_id
                  setSelectedProvider("deezer");
                  getPlatformLink();
                }}
              >
                Deezer
              </Button>

              {/* Copier le nom */}
              <Button variant="outlined" onClick={() => copyFirstSongText()}>
                Copier le nom de la chanson
              </Button>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ====== MODALE SUCCÈS ====== */}
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
          <Card onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 560 }}>
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="h6">Tes succès</Typography>
                <Button onClick={() => setAchOpen(false)}>Fermer</Button>
              </Box>

              <List dense>
                {achievementsWithoutTotal.map((ach, i) => (
                  <ListItem key={i} disableGutters>
                    <ListItemText primary={ach.name} secondary={ach.desc} />
                    <Typography variant="body2">+{ach.points}</Typography>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}
