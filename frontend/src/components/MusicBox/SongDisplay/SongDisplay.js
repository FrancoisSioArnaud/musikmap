import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/* Composants factorisés */
import Deposit from "../../Common/Deposit";
import MainDeposit from "./MainDeposit";

export default function SongDisplay({
  dispDeposits,
  setDispDeposits,
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

  const dep0 = deposits[0] || null;

  return (
    <Box sx={{ display: "grid", gap: 2, pt:"64px" ,/* pas de padding root */ }}>
      {/* HERO simple */}
      <Box id="intro">
        <Typography component="h1" variant="h1">
          La dernière chanson déposée ici
        </Typography>
        <Typography component="span" variant="h5">
          (par un vrai humain.e)
        </Typography>
      </Box>

      {/* SECTION — MAIN (encart pointillé avec le main, bouton déposer, et état post-dépôt) */}
      <MainDeposit
        dep0={dep0}
        user={user}
        boxName={boxName}
        isSpotifyAuthenticated={isSpotifyAuthenticated}
        isDeezerAuthenticated={isDeezerAuthenticated}
      />

      {/* SECTION — OLDER DEPOSITS (idx > 0) — utilise <Deposit variant="list" /> */}
      <Box
        id="older_deposits"
        sx={{
          mt: "32px",
          display: "grid",
          gap: 0,
          pb: 2,
        }}
      >
        <Typography component="h2" variant="h3" >
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
              dep={dep}
              user={user}
              setDispDeposits={setDispDeposits}
              cost={cost}
              variant="list"
              showDate={true}
              showUser={true}
              fitContainer={false}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
