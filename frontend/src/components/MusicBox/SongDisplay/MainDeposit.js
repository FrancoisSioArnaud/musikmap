import React, { useMemo, useState, useEffect } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CheckIcon from '@mui/icons-material/Check';
import AlbumIcon from "@mui/icons-material/Album";

import Deposit from "../../Common/Deposit";
import LiveSearch from "./LiveSearch";
import { getCookie } from "../../Security/TokensUtils";

/**
 * MainDeposit (nouveau rendu) :
 *  - dep0 reste toujours affiché en <Deposit variant="main" />.
 *  - Après succès, on affiche mon dépôt (<Deposit variant="list" />) sous le main, avec id="my_deposit".
 *  - Le bloc "Ta chanson a été déposée / Voir mes points" est déplacé SOUS myDeposit (container .post_deposit_success).
 *  - Drawer unique (search <-> achievements) inchangé ; retour Achievements -> scroll vers #older_deposits (inchangé).
 */
export default function MainDeposit({
  dep0,
  user,
  boxName,
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  onDeposited = () => {},
}) {
  const [myDeposit, setMyDeposit] = useState(null);

  // Drawer unique
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("search"); // "search" | "achievements"

  // Succès / points (pour affichage)
  const [successes, setSuccesses] = useState([]);

  const totalPoints = useMemo(() => {
    const arr = Array.isArray(successes) ? successes : [];
    const byName = (name) => arr.find((s) => (s?.name || "").toLowerCase() === name);
    return byName("total")?.points ?? byName("points_total")?.points ?? 0;
  }, [successes]);

  // Log "découverte" de la #0 (best-effort)
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
      // best-effort
    });
  }, [dep0?.deposit_id, user?.username]);

  // Ouvrir/fermer drawer
  const openSearch = () => {
    if (myDeposit) return; // un seul dépôt par session d’affichage
    setDrawerView("search");
    setIsDrawerOpen(true);
  };
  const closeDrawer = () => setIsDrawerOpen(false);

  // Après POST réussi (LiveSearch)
  const handleDepositSuccess = (addedDeposit, succ) => {
    setMyDeposit(addedDeposit || null);
    setSuccesses(Array.isArray(succ) ? succ : []);
    setDrawerView("achievements"); // swap contenu
    setIsDrawerOpen(true);         // reste ouvert
    onDeposited();                 // débloque older_deposits dans le fond
  };

  const handleBackToBox = () => {
    // ferme le drawer puis scroll vers older_deposits (inchangé selon ton choix)
    setIsDrawerOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById("older_deposits");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const hasMyDeposit = Boolean(myDeposit);

  return (
    <>
      {/* Intro */}
      <Box className="intro">
        <Typography component="h1" variant="h1">
          Bonne écoute !
        </Typography>
        <Typography component="h2" variant="h4">
          Découvre puis remplace la chanson actuellement dans la boîte
        </Typography>
      </Box>

      {/* 1) Card main : dep0 TOUJOURS en "main" */}
      <Deposit
        dep={dep0}
        user={user}
        variant="main"
        fitContainer={true}
        showDate={true}
        showUser={true}
      />

      {/* 2) Avant dépôt : CTA pleine largeur (disparaît après succès) */}
      {!hasMyDeposit && (
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={openSearch}
          disabled={!boxName}
          startIcon={<SearchIcon />}
        >
          Déposer une chanson
        </Button>
      )}

      {/* 3) Après dépôt : mon dépôt en LIST révélé (sans section réactions si demandé) */}
      {hasMyDeposit && myDeposit && (
        <Box id="my_deposit">
          <Deposit
            dep={myDeposit}
            user={user}
            variant="list"
            showDate={false}     // <-- demandé
            showUser={true}
            fitContainer={true}
            showReact={false}    // <-- déjà demandé précédemment
            showPlay={false}     // <-- NOUVEAU : masque le bouton Play en LIST pour mon dépôt
          />
        </Box>
      )}

      {/* 4) Bloc succès/points déplacé SOUS mon dépôt */}
      {hasMyDeposit && (
        <Box className="post_deposit_success" sx={{ display: "grid", gap: 2, mt: 1 }}>
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
              variant="outlined"
              className="decouvrir"
              onClick={() => {
                setDrawerView("achievements");
                setIsDrawerOpen(true);
              }}
              aria-label="Voir mes points"
            >
              Voir mes points
              {totalPoints > 0 && (
                <Box className="points_container" sx={{ ml: "12px" }}>
                  <Typography
                    variant="body1"
                    component="span"
                    sx={{ color: "text.primary" }}
                  >
                    +{totalPoints}
                  </Typography>
                  <AlbumIcon />
                </Box>
              )}
            </Button>
          </Box>
        </Box>
      )}

      {/* Drawer unique — Search <-> Achievements */}
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={() => {}} // pas de fermeture backdrop/ESC
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: "100vw",
            maxWidth: 560,
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* HEADER du drawer — 51px fixes */}
        <Box
          component="header"
          sx={{
            height: 51,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            px: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            flex: "0 0 auto",
          }}
        >
          <IconButton aria-label="Fermer" onClick={closeDrawer}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* CONTENU plein écran (reste de la hauteur) */}
        <Box
          component="main"
          sx={{
            flex: "1 1 auto",
            minHeight: 0,           // nécessaire pour overflow en flexbox
            overflow: "auto",
          }}
        >
          <Box sx={{ boxSizing: "border-box", minHeight: "100%" }}>
            {drawerView === "search" ? (
              <LiveSearch
                isSpotifyAuthenticated={isSpotifyAuthenticated}
                isDeezerAuthenticated={isDeezerAuthenticated}
                boxName={boxName}
                user={user}
                onDepositSuccess={handleDepositSuccess}
                onClose={closeDrawer}
              />
            ) : (
              <AchievementsPanel
                successes={Array.isArray(successes) ? successes : []}
                onPrimaryCta={handleBackToBox}
              />
            )}
          </Box>
        </Box>
      </Drawer>
    </>
  );
}

/* Contenu Achievements dans le drawer (inchangé fonctionnellement) */
function AchievementsPanel({ successes = [], onPrimaryCta }) {
  const totalPoints =
    successes.find((s) => (s?.name || "").toLowerCase() === "total")?.points ??
    successes.find((s) => (s?.name || "").toLowerCase() === "points_total")?.points ??
    0;

  const listItems = successes.filter((s) => {
    const n = (s?.name || "").toLowerCase();
    return n !== "total" && n !== "points_total";
  });

  return (
    <Box sx={{ display: "grid", gap: 1 }}>
      <Box className="intro">
        <CheckIcon color="success" />
        <Typography variant="h1">
          Pépite Déposé
        </Typography>

        <Box className="points_container">
          <Typography component="span" variant="body1">+{totalPoints}</Typography>
          <AlbumIcon/>
        </Box>
      </Box>

      <List className="success_container">
        {listItems.map((ach, idx) => (
          <ListItem key={idx} className="success">
            <Box className="points_container">
              <Typography component="span" variant="body1">+{ach.points}</Typography>
              <AlbumIcon />
            </Box>

            <Typography variant="h3" className="success_title">
              {ach.name}
            </Typography>

            <Typography variant="body1" className="success_desc">
              {ach.desc}
            </Typography>

            {typeof ach.emoji === "string" && ach.emoji.trim() !== "" && (
              <Typography
                variant="body1"
                className="success_emoji"
                aria-label={`emoji ${ach.name}`}
              >
                {ach.emoji}
              </Typography>
            )}
          </ListItem>
        ))}
      </List>

      <Box sx={{ mt: 1 }}>
        <Button fullWidth variant="contained" onClick={onPrimaryCta}>
          Retour à la boîte
        </Button>
      </Box>
    </Box>
  );
}
