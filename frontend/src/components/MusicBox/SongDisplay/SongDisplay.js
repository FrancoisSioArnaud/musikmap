import React, { useMemo, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { getCookie } from "../../Security/TokensUtils";
import Deposit from "../../Common/Deposit";
import MyDeposit from "./MyDeposit";

export default function SongDisplay({
  dispDeposits,
  setDispDeposits, // utilisé pour maj après reveal via <Deposit />
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
  revealCost,
}) {
  const cost = typeof revealCost === "number" ? revealCost : 40;

  // Sécurise la liste
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  // Auto-enregistrer le dépôt #0 comme "main" au montage (si connecté)
  useEffect(() => {
    if (!user || !user.username) return;
    const first = Array.isArray(dispDeposits) && dispDeposits.length > 0 ? dispDeposits[0] : null;
    const firstId = first?.deposit_id;
    if (!firstId) return;

    const csrftoken = getCookie("csrftoken");
    fetch("/box-management/discovered-songs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({ deposit_id: firstId, discovered_type: "main" }),
      credentials: "same-origin",
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!deposits.length) {
    // Si jamais cette page est appelée sans dépôt, on garde un rendu minimal
    return (
      <Box sx={{ display: "grid", gap: 2 }}>
        <Box
          id="intro"
          sx={{
            width: "100%",
            borderRadius: 2,
            display: "flex",
            flexDirection: "column",
            gap: 0.5,
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            mt: "16px",
            mb: "16px",
            py: 2,
          }}
        >
          <Typography component="h1" variant="h6" sx={{ fontWeight: 700 }}>
            Aucune pépite pour le moment
          </Typography>
        </Box>

        {/* Section MyDeposit tout de même disponible */}
        <MyDeposit
          user={user}
          boxName={boxName}
          isSpotifyAuthenticated={isSpotifyAuthenticated}
          isDeezerAuthenticated={isDeezerAuthenticated}
        />
      </Box>
    );
  }

  /* =========================================================
     RENDU — CAS AVEC PÉPITES
  ========================================================= */
  return (
    <Box sx={{ display: "grid", gap: 2 /* pas de padding root */ }}>
      {/* HERO simple */}
      <Box
        id="intro"
        sx={{
          width: "100%",
          borderRadius: 2,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          mt: "16px",
          mb: "16px",
          py: 2,
        }}
      >
        <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
          La dernière chanson déposée ici
        </Typography>
        <Typography component="span" variant="subtitle2" sx={{ opacity: 0.8 }}>
          (par un vrai humain.e)
        </Typography>
      </Box>

      {/* Dépôt idx === 0 (plein format) → utilise Deposit variant="main" */}
      <Box sx={{ px: 2 /* 16px gauche/droite demandé */ }}>
        <Deposit
          variant="main"
          dep={deposits[0]}
          user={user}
          setDispDeposits={setDispDeposits}
          cost={cost}
        />
      </Box>

      {/* SECTION — MY_DEPOSIT (42px marges) */}
      <MyDeposit
        user={user}
        boxName={boxName}
        isSpotifyAuthenticated={isSpotifyAuthenticated}
        isDeezerAuthenticated={isDeezerAuthenticated}
      />

      {/* SECTION — OLDER DEPOSITS (idx > 0) */}
      <Box
        id="older_deposits"
        sx={{
          mt: "32px",
          display: "grid",
          gap: 0,
          pb: 2,
        }}
      >
        <Typography
          component="h2"
          variant="h6"
          sx={{ fontWeight: 700, textAlign: "left", px: 2 /* padding X sur le titre uniquement */ }}
        >
          Pépites déposées plus tôt à révéler
        </Typography>

        {/* Scroller horizontal */}
        <Box
          id="older_deposits_scroller"
          aria-label="Liste horizontale des dépôts plus anciens"
          sx={{
            display: "flex",
            gap: "12px",
            overflowX: "auto",
            overflowY: "hidden",
            p: 2,
            // cacher la scrollbar (WebKit/Firefox/Edge/IE)
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {deposits.slice(1).map((dep, idx) => (
            <Deposit
              key={`dep-${dep?.deposit_id ?? `older-${idx}`}`}
              variant="list"
              dep={dep}
              user={user}
              setDispDeposits={setDispDeposits}
              cost={cost}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
