import React, { useMemo, useState, useEffect } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import Deposit from "../../Common/Deposit";
import LiveSearch from "./LiveSearch";
import AchievementModal from "./AchievementModal";
import { getCookie } from "../../Security/TokensUtils";

/**
 * MainDeposit : section principale
 *  - Affiche le dépôt idx 0 (ou myDeposit après dépôt) dans un encart pointillé qui entoure
 *    UNIQUEMENT la card <Deposit variant="main" /> (pas le reste).
 *  - Avant dépôt : titre + bouton full-width sous l’encart pointillé.
 *  - Après dépôt : bloc succès + ex-main rendu en <Deposit variant="list" fitContainer /> sous l’encart.
 *
 * Props :
 * - dep0: objet dépôt à l'index 0 (ou null)
 * - user, boxName, isSpotifyAuthenticated, isDeezerAuthenticated
 */
export default function MainDeposit({
  dep0,
  user,
  boxName,
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
}) {
  // Dépôt tout juste ajouté (non injecté dans dispDeposits parent, scope local)
  const [myDeposit, setMyDeposit] = useState(null);

  // Drawer LiveSearch
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Succès / points (pour Achievements)
  const [successes, setSuccesses] = useState([]);
  const [isAchOpen, setIsAchOpen] = useState(false);

  // Points total affiché dans le bouton "Voir mes points"
  const totalPoints = useMemo(() => {
    const arr = Array.isArray(successes) ? successes : [];
    const byName = (name) => arr.find((s) => (s?.name || "").toLowerCase() === name);
    return byName("total")?.points ?? 0;
  }, [successes]);

  // ---- Enregistrement "main" (découverte de la #0) déplacé ici ----
  useEffect(() => {
    if (!dep0 || !dep0.deposit_id) return;
    if (!user || !user.username) return;

    const csrftoken = getCookie("csrftoken");
    fetch("/box-management/discovered-songs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      credentials: "same-origin",
      body: JSON.stringify({ deposit_id: dep0.deposit_id, discovered_type: "main" }),
    }).catch(() => {
      // silencieux, tolère le 400 "déjà découvert"
    });
  }, [dep0?.deposit_id, user?.username]);

  // ---- Drawer handlers ----
  const openSearch = () => {
    if (myDeposit) return; // un seul dépôt possible par session d'affichage
    setIsSearchOpen(true);
  };
  const closeSearch = () => setIsSearchOpen(false);

  // ---- Après POST réussi (LiveSearch) ----
  const handleDepositSuccess = (addedDeposit, succ) => {
    setMyDeposit(addedDeposit || null);
    setSuccesses(Array.isArray(succ) ? succ : []);
    setIsSearchOpen(false); // ferme le drawer
    setIsAchOpen(true);     // ouvre l’overlay achievements
  };

  const hasMyDeposit = Boolean(myDeposit);

  return (
    <>
      <Box sx={{ px: 2, display: "grid", gap: 2 }}>
        {/* 1) Encart pointillé entourant UNIQUEMENT la card Deposit main */}
        <Box
          sx={{
            border: "2px dashed #cbd5e1",
            borderRadius: 2,
            p: 2,
          }}
        >
          <Deposit
            dep={hasMyDeposit ? myDeposit : dep0}
            user={user}
            variant="main"
            fitContainer={true}
            showDate={true}
            showUser={true}
          />
        </Box>

        {/* 2) Avant dépôt : titre + bouton full-width (en dehors du pointillé) */}
        {!hasMyDeposit && (
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography component="h2" variant="h6" sx={{ fontWeight: 700, textAlign: "left" }}>
              Remplace cette chanson et révèle des chansons précédentes
            </Typography>
            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={openSearch}
              disabled={!boxName}
            >
              Déposer une chanson
            </Button>
          </Box>
        )}

        {/* 3) Après dépôt : bloc succès + ex-main (en dehors du pointillé) */}
        {hasMyDeposit && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography component="h2" variant="h6" sx={{ fontWeight: 700, textAlign: "left" }}>
                Ta chanson a été déposée
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

              <Button
                variant="contained"
                onClick={() => setIsAchOpen(true)}
                aria-label="Voir mes points"
              >
                Voir mes points {totalPoints ? `(+${totalPoints})` : ""}
              </Button>
            </Box>

            {/* Ancien main affiché juste sous le bloc succès, en carte "list" plein conteneur */}
            {dep0 && (
              <Deposit
                dep={dep0}
                user={user}
                cost={40}
                variant="list"
                showDate={true}
                showUser={true}
                fitContainer={true}
              />
            )}
          </Box>
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
    </>
  );
}
