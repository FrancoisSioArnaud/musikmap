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

import Deposit from "../../Common/Deposit";
import LiveSearch from "./LiveSearch";
import { getCookie } from "../../Security/TokensUtils";

/**
 * MainDeposit :
 *  - Affiche la card <Deposit variant="main" /> sans encart pointillé.
 *  - Drawer unique (right, plein écran mobile) : LiveSearch puis Achievements (swap de contenu).
 *  - older_deposits n’apparaît qu’après succès du POST (remonté via onDeposited()).
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

  // Succès / points (pour affichage dans drawer achievements)
  const [successes, setSuccesses] = useState([]);

  const totalPoints = useMemo(() => {
    const arr = Array.isArray(successes) ? successes : [];
    const byName = (name) => arr.find((s) => (s?.name || "").toLowerCase() === name);
    return byName("total")?.points ?? byName("points_total")?.points ?? 0;
  }, [successes]);

  // Enregistrement "main" (découverte de la #0)
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
    setDrawerView("achievements"); // swap contenu dans le même drawer
    setIsDrawerOpen(true);         // garde le drawer ouvert
    onDeposited();                 // <-- débloque older_deposits dans le fond
  };

  const handleBackToBox = () => {
    // ferme le drawer PUIS scroll au haut de older_deposits
    setIsDrawerOpen(false);
    requestAnimationFrame(() => {
      const el = document.getElementById("older_deposits");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const hasMyDeposit = Boolean(myDeposit);

  return (
    <>

      <Box class="intro">
        <Typography component="h1" variant="h1">
          Bonne écoute !
        </Typography>
        <Typography component="span" variant="h4">
          Découvre puis remplace la chanson actuellement dans la boîte
        </Typography>
      </Box>
    
      <Box sx={{ px: 2, display: "grid", gap: 2 }}>
        {/* 1) Card main directement (sans encart pointillé) */}
        <Deposit
          dep={hasMyDeposit ? myDeposit : dep0}
          user={user}
          variant="main"
          fitContainer={true}
          showDate={true}
          showUser={true}
        />

        {/* 2) Avant dépôt : CTA pleine largeur */}
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

        {/* 3) Après dépôt : bloc succès + ex-main (list, full) */}
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
                onClick={() => { setDrawerView("achievements"); setIsDrawerOpen(true); }}
                aria-label="Voir mes points"
              >
                Voir mes points {totalPoints ? `(+${totalPoints})` : ""}
              </Button>
            </Box>

            {/* Ancien main affiché juste sous le bloc succès */}
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

      {/* Drawer unique — Search <-> Achievements */}
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={() => {}} // pas de fermeture backdrop/ESC
        ModalProps={{
          keepMounted: true,
          // Scroll du fond bloqué par défaut
        }}
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
            minHeight: 0,           // nécessaire pour que overflow fonctionne en flexbox
            overflow: "auto",
          }}
        >
          <Box sx={{ p: 2, boxSizing: "border-box", minHeight: "100%" }}>
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

/* Contenu Achievements dans le drawer (swap avec LiveSearch) */
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
      <Box class="intro">
        <CheckIcon color="success" />
        <Typography variant="h1">
          Pépite Déposé
        </Typography>
  
        <Typography class="points" variant="h4">
          +{totalPoints}
        </Typography>
      </Box>

      <List>
        {listItems.length === 0 ? (
          <ListItem>
            <ListItemText primary="Aucun succès détaillé" />
          </ListItem>
        ) : (
          listItems.map((ach, idx) => (
            <ListItem key={idx}>
              <Typography variant="subtitle1">+{ach.points}</Typography>
              <Typography variant="h3">{ach.name}</Typography>
              <Typography variant="body">{ach.desc}</Typography>
            </ListItem>
          ))
        )}
      </List>

      <Box sx={{ mt: 1 }}>
        <Button fullWidth variant="contained" onClick={onPrimaryCta}>
          Retour à la boîte
        </Button>
      </Box>
    </Box>
  );
}
