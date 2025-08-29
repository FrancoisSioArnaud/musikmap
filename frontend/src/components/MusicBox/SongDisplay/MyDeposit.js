import React, { useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import PlayModal from "../../Common/PlayModal";
import LiveSearch from "./LiveSearch";
import AchievementModal from "./AchievementModal";

/**
 * MyDeposit : gère toute la section "Dépose une chanson" (avant/après)
 * - Drawer LiveSearch (recherche + POST)
 * - Affichage du succès via AchievementModal (points & succès)
 * - PlayModal local pour la chanson déposée
 *
 * Props requis :
 * - user
 * - boxName
 * - isSpotifyAuthenticated
 * - isDeezerAuthenticated
 */
export default function MyDeposit({
  user,
  boxName,
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
}) {
  // Dépôt tout juste ajouté (NON injecté dans dispDeposits parent, scope local)
  const [myDeposit, setMyDeposit] = useState(null);

  // Drawer LiveSearch
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Succès / points (pour Achievements)
  const [successes, setSuccesses] = useState([]);
  const [isAchOpen, setIsAchOpen] = useState(false);

  // PlayModal local
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

  // Total points (badge)
  const totalPoints = useMemo(() => {
    const item = successes.find((s) => (s?.name || "").toLowerCase() === "total");
    return item?.points ?? 0;
  }, [successes]);

  // ---- Drawer handlers ----
  const openSearch = () => {
    if (myDeposit) return; // un seul dépôt possible
    setIsSearchOpen(true);
  };
  const closeSearch = () => setIsSearchOpen(false);

  // ---- Après POST réussi (LiveSearch) ----
  const handleDepositSuccess = (addedDeposit, succ) => {
    setMyDeposit(addedDeposit || null);
    setSuccesses(Array.isArray(succ) ? succ : []);
    setIsSearchOpen(false);       // ferme le drawer
    setIsAchOpen(true);           // ouvre l’overlay achievements
  };

  // Composant compact pour afficher le dépôt réalisé
  const MyDepositSongCompact = () => (
    <Box
      id="deposit_song"
      sx={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 2,
        alignItems: "center",
      }}
    >
      <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
        {myDeposit?.song?.img_url && (
          <Box
            component="img"
            src={myDeposit.song.img_url}
            alt={`${myDeposit?.song?.title ?? ""} - ${myDeposit?.song?.artist ?? ""}`}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
          {myDeposit?.song?.title}
        </Typography>
        <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
          {myDeposit?.song?.artist}
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => openPlayFor(myDeposit?.song)}
          sx={{ alignSelf: "flex-start", mt: 0.5 }}
        >
          Play
        </Button>
      </Box>
    </Box>
  );

  const before = !myDeposit;

  return (
    <>
      {/* SECTION — MY_DEPOSIT */}
      <Box
        id="my_deposit"
        sx={{
          mt: "42px",
          mb: "42px",
          display: "grid",
          gap: 2,
          px: 2, // padding latéral voulu
        }}
      >
        {before ? (
          <>
            <Typography component="h1" variant="h5" sx={{ fontWeight: 700, textAlign: "left" }}>
              Dépose une chanson
            </Typography>

            <Typography variant="body1" sx={{ textAlign: "left" }}>
              Ajoute une chanson et gagne des crédits pour pouvoir révéler des pépites plus anciennes.
            </Typography>

            <Box
              sx={{
                border: "2px dashed #cbd5e1",
                borderRadius: 2,
                p: 2,
                display: "grid",
                placeItems: "center",
                aspectRatio: "5 / 2",
                bgcolor: "transparent",
              }}
            >
              <Button variant="contained" size="large" onClick={openSearch}>
                Déposer une chanson
              </Button>
            </Box>
          </>
        ) : (
          <>
            {/* Après dépôt */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 700, textAlign: "left" }}>
                Ta chanson est déposée
              </Typography>
              <CheckCircleIcon color="success" fontSize="medium" />
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <Typography variant="body1" sx={{ textAlign: "left", flex: "1 1 auto", minWidth: 220 }}>
                Révèle d&apos;autres chansons avec les crédits que tu as gagnés.
              </Typography>

              {/* Pastille points → ouvre l’overlay des succès */}
              <Box
                role="button"
                tabIndex={0}
                onClick={() => setIsAchOpen(true)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setIsAchOpen(true)}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  userSelect: "none",
                }}
                aria-label="Voir les succès gagnés"
              >
                +{totalPoints}
              </Box>
            </Box>

            <Box sx={{ border: "2px dashed #cbd5e1", borderRadius: 2, p: "12px" }}>
              <MyDepositSongCompact />
            </Box>
          </>
        )}
      </Box>

      {/* Drawer — LiveSearch */}
      <Drawer
        anchor="right"
        open={isSearchOpen}
        onClose={() => {}} // pas de fermeture backdrop/ESC
        ModalProps={{ keepMounted: true, disableRestoreFocus: true }}
        PaperProps={{ sx: { width: "100vw" } }}
      >
        <Box sx={{ p: 2, display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <IconButton aria-label="Fermer" onClick={closeSearch}>
              <CloseIcon />
            </IconButton>
          </Box>

          <LiveSearch
            isSpotifyAuthenticated={isSpotifyAuthenticated}
            isDeezerAuthenticated={isDeezerAuthenticated}
            boxName={boxName}
            user={user}
            onDepositSuccess={handleDepositSuccess}
            onClose={closeSearch}
          />
        </Box>
      </Drawer>

      {/* Overlay Succès / Points */}
      <AchievementModal
        open={isAchOpen}
        successes={Array.isArray(successes) ? successes : []}
        onClose={() => setIsAchOpen(false)}
        primaryCtaLabel="Revenir à la boîte"
      />

      {/* PlayModal local */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
    </>
  );
}
