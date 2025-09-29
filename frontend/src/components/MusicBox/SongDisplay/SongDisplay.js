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
  showOlder = false,          // <-- masqué par défaut
  onDeposited = () => {},     // <-- appelé au succès du POST (pour afficher older)
}) {
  const cost = typeof revealCost === "number" ? revealCost : 40;

  // Sécurise la liste
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  const dep0 = deposits[0] || null;

  return (
    <Box>
      
      {/* SECTION — MAIN */}
      <MainDeposit
        dep0={dep0}
        user={user}
        boxName={boxName}
        isSpotifyAuthenticated={isSpotifyAuthenticated}
        isDeezerAuthenticated={isDeezerAuthenticated}
        onDeposited={onDeposited}  // <-- prop pour remonter l’info
      />

      {/* SECTION — OLDER DEPOSITS (vertical, full-width) — seulement après dépôt */}
      {showOlder && (
        <Box
          id="older_deposits"
          sx={{
            display: "grid",
            gap: 2,
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
                fitContainer={true}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
