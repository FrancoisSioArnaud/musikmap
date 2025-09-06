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
    <Box sx={{ display: "grid", gap: 2, pt: "64px" }}>
      {/* HERO simple */}
      <Box id="intro">
        <Typography component="h1" variant="h1">
          La dernière chanson déposée ici
        </Typography>
        <Typography component="span" variant="h5">
          (par un vrai humain.e)
        </Typography>
      </Box>

      {/* SECTION — MAIN */}
      <MainDeposit
        dep0={dep0}
        user={user}
        boxName={boxName}
        isSpotifyAuthenticated={isSpotifyAuthenticated}
        isDeezerAuthenticated={isDeezerAuthenticated}
      />

      {/* SECTION — OLDER DEPOSITS (vertical full-width) */}
      <Box
        id="older_deposits"
        sx={{
          mt: "32px",
          display: "grid",
          gap: 2,
          pb: 2,
        }}
      >
        <Typography component="h2" variant="h3">
          Pépites déposées plus tôt à révéler
        </Typography>

        <Box
          id="older_deposits_list"
          sx={{
            display: "grid",
            gap: 2,
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
              fitContainer={true} // toujours pleine largeur (Deposit est full-width)
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
