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
import { UserContext } from "../../UserContext"; // non utilisé ici mais prêt si besoin
import { getCookie } from "../../Security/TokensUtils";
import { getUserDetails, checkUserStatus } from "../../UsersUtils";

/**
 * Affiche les 10 précédents dépôts d'une boîte.
 * - 1er dépôt (index 0) : affichage complet + bouton Play -> modale (Fermer / Spotify / Deezer / Copier nom)
 * - 9 suivants (index 1..9) : image floutée + bouton Révéler (cost) -> GET /box-management/revealSong
 *
 * Props:
 * - dispDeposits: Deposit[] (les 10 dépôts à afficher)
 * - setDispDeposits: React.Dispatch<Deposit[]> (setter venant du parent)
 * - achievements: Success[] (liste des succès, inclut "Total")
 * - setAchievement: setter des succès (non utilisé ici, mais dispo)
 */
export default function SongDisplay({
  dispDeposits,
  setDispDeposits,
  achievements,
  setAchievement,
}) {
  console.log("dispDeposits : ")
  console.log(dispDeposits)
  console.log("achievements : ")
  console.log(achievements)
  const navigate = useNavigate();

  // Garde-fous : toujours travailler avec des tableaux
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );
  const succ = useMemo(
    () => (Array.isArray(achievements) ? achievements : []),
    [achievements]
  );

  // ----------- Helpers généraux -----------

  // Total de points = succès dont name === "Total"
  const totalPoints = useMemo(() => {
    const item = succ.find((s) => (s?.name || "").toLowerCase() === "total");
    return item?.points ?? 0;
  }, [succ]);

  // Succès à afficher dans la modale (tous sauf "Total")
  const displaySuccesses = useMemo(
    () => succ.filter((s) => (s?.name || "").toLowerCase() !== "total"),
    [succ]
  );

  // Map id -> nom de plateforme
  const PLATFORM_MAP = { 1: "spotify", 2: "deezer" };

  // Ouvre un lien Spotify/Deezer :
  // - si url directe de la plateforme : on l'ouvre
  // - sinon on ouvre une recherche
  const openPlatformLink = (song, provider /* 'spotify' | 'deezer' */) => {
    const { title, artist, url } = song || {};
    const q = encodeURIComponent(`${title ?? ""} ${artist ?? ""}`.trim());

    if (provider === "spotify") {
      const direct = url && url.includes("open.spotify.com") ? url : `https://open.spotify.com/search/${q}`;
      window.open(direct, "_blank");
      return;
    }
    if (provider === "deezer") {
      const direct = url && url.includes("deezer.com") ? url : `https://www.deezer.com/search/${q}`;
      window.open(direct, "_blank");
      return;
    }
  };

  // Copie "Titre - Artiste" dans le presse-papiers
  const copySongText = async (song) => {
    const text = `${song?.title ?? ""} - ${song?.artist ?? ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié dans le presse-papiers !");
    } catch {
      // Fallback basique
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Copié dans le presse-papiers !");
    }
  };

  // ----------- Modale PLAY (1er dépôt) -----------
  const [playOpen, setPlayOpen] = useState(false);

  const openPlayModal = () => setPlayOpen(true);
  const closePlayModal = () => setPlayOpen(false);

  // Le provider est forcé au platform_id du song du 1er dépôt
  const firstDeposit = deposits[0] || null;
  const firstSong = firstDeposit?.song || null;
  const selectedProvider =
    PLATFORM_MAP[firstSong?.platform_id] ?? (firstSong?.url?.includes("deezer.com") ? "deezer" : "spotify");

  // ----------- Modale SUCCÈS (1er dépôt) -----------
  const [successOpen, setSuccessOpen] = useState(false);
  const openSuccessModal = () => setSuccessOpen(true);
  const closeSuccessModal = () => setSuccessOpen(false);

  // ----------- Révélation d'un dépôt (indices 1..9) -----------
  async function revealSong(idx /* index du dépôt à révéler */) {
    const dep = deposits[idx];
    const cost = dep?.song?.cost;
    const songId = dep?.song?.id;
    if (!songId || !cost) return;

    const csrftoken = getCookie("csrftoken");

    // Spécification demandée: requête GET vers /box-management/revealSong
    // -> On passe les params en query string (GET + "body" = non standard)
    const url = `/box-management/revealSong?song_id=${encodeURIComponent(songId)}&cost=${encodeURIComponent(cost)}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "X-CSRFToken": csrftoken,
        },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      // data attendu:
      // { song: { title, artist, url, platform_id } }

      // Met à jour le dépôt i: on fusionne les nouvelles infos song
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
      {/* =================== DÉPÔT #1 : affichage complet =================== */}
      <Card sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Dépôt le plus récent
        </Typography>

        <Box
          id="deposit_date"
          sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}
        >
          {firstDeposit?.deposit_date}
        </Box>

        <Box
          id="deposit_user"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 2,
            cursor: "pointer",
          }}
          onClick={() => {
            if (firstDeposit?.user?.id != null) {
              navigate("/profile/" + firstDeposit.user.id);
            }
          }}
        >
          <Avatar
            src={firstDeposit?.user?.profile_pic_url || undefined}
            alt={firstDeposit?.user?.name || "Anonyme"}
            sx={{ width: 40, height: 40 }}
          />
          <Typography>{firstDeposit?.user?.name || "Anonyme"}</Typography>
        </Box>

        <Box
          id="deposit_song"
          sx={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 2, alignItems: "center" }}
        >
          <CardMedia
            component="img"
            image={firstSong?.img_url || undefined}
            alt={`${firstSong?.title || ""} - ${firstSong?.artist || ""}`}
            sx={{ width: 96, height: 96, objectFit: "cover", borderRadius: 1 }}
          />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {firstSong?.title || "Titre inconnu"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {firstSong?.artist || "Artiste inconnu"}
            </Typography>
          </Box>
          <Button variant="contained" onClick={openPlayModal}>
            Play
          </Button>
        </Box>

        <Box id="deposit_interact" sx={{ mt: 2 }}>
          <Button variant="outlined" onClick={openSuccessModal}>
            Points gagnés : {totalPoints}
          </Button>
        </Box>
      </Card>

      {/* =================== DÉPÔTS #2..#10 : format “révéler” =================== */}
      {deposits.slice(1).map((dep, i) => {
        const idx = i + 1; // index réel dans deposits
        const u = dep?.user;
        const s = dep?.song || {};
        const isRevealed = Boolean(s?.title && s?.artist); // si déjà révélé

        // Provider calculé si révélé
        const provider = PLATFORM_MAP[s?.platform_id] ?? (s?.url?.includes("deezer.com") ? "deezer" : "spotify");

        return (
          <Card key={idx} sx={{ p: 2 }}>
            {/* Date */}
            <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {dep?.deposit_date}
            </Box>

            {/* User */}
            <Box
              id="deposit_user"
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, cursor: "pointer" }}
              onClick={() => {
                if (u?.id != null) {
                  navigate("/profile/" + u.id);
                }
              }}
            >
              <Avatar
                src={u?.profile_pic_url || undefined}
                alt={u?.name || "Anonyme"}
                sx={{ width: 40, height: 40 }}
              />
              <Typography>{u?.name || "Anonyme"}</Typography>
            </Box>

            {/* Song (flouté tant que non révélé) */}
            <Box
              id="deposit_song"
              sx={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 2, alignItems: "center" }}
            >
              <CardMedia
                component="img"
                image={s?.img_url || undefined}
                alt="Cover"
                sx={{
                  width: 96,
                  height: 96,
                  objectFit: "cover",
                  borderRadius: 1,
                  filter: isRevealed ? "none" : "blur(6px) brightness(0.9)",
                  transition: "filter .2s ease",
                }}
              />
              <Box>
                {isRevealed ? (
                  <>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {s?.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s?.artist}
                    </Typography>
                  </>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Titre caché
                  </Typography>
                )}
              </Box>

              <Box id="deposit_interact" sx={{ display: "flex", gap: 1 }}>
                {isRevealed ? (
                  <>
                    <Button variant="contained" onClick={() => openPlatformLink(s, provider)}>
                      Ouvrir ({provider})
                    </Button>
                    <Button variant="outlined" onClick={() => copySongText(s)}>
                      Copier le nom
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="contained"
                    onClick={() => revealSong(idx)}
                    title="Révéler la chanson"
                  >
                    Révéler — {s?.cost ?? "?"}
                  </Button>
                )}
              </Box>
            </Box>
          </Card>
        );
      })}

      {/* =================== MODALE PLAY (pour le 1er dépôt) =================== */}
      {playOpen && (
        <Overlay onClose={closePlayModal}>
          <Card sx={{ width: "100%", maxWidth: 420, borderRadius: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                <Typography variant="h6" sx={{ mr: 2 }} noWrap>
                  {firstSong?.title || "Titre"} — {firstSong?.artist || "Artiste"}
                </Typography>
                <Button onClick={closePlayModal} title="Fermer">×</Button>
              </Box>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button variant="contained" onClick={() => openPlatformLink(firstSong, "spotify")}>
                  Spotify
                </Button>
                <Button variant="contained" onClick={() => openPlatformLink(firstSong, "deezer")}>
                  Deezer
                </Button>
                <Button variant="outlined" onClick={() => copySongText(firstSong)}>
                  Copier le nom de la chanson
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Overlay>
      )}

      {/* =================== MODALE SUCCÈS =================== */}
      {successOpen && (
        <Overlay onClose={closeSuccessModal}>
          <Card sx={{ width: "100%", maxWidth: 520, borderRadius: 2 }}>
            <CardContent sx={{ pb: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6">Tes succès</Typography>
                <Button onClick={closeSuccessModal}>Fermer</Button>
              </Box>

              <List sx={{ mt: 1 }}>
                {displaySuccesses.length === 0 && (
                  <ListItem>
                    <ListItemText primary="Aucun succès (hors Total)" />
                  </ListItem>
                )}
                {displaySuccesses.map((ach, i) => (
                  <ListItem key={i} divider>
                    <ListItemText primary={ach.name} secondary={ach.desc} />
                    <Typography variant="body2">+{ach.points}</Typography>
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Overlay>
      )}
    </Box>
  );
}

/** Petit composant Overlay simple (sans Dialog) pour rester dans tes imports */
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
