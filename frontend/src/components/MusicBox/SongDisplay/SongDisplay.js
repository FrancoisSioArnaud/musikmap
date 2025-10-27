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
    <Box className="song_display" sx={{ p: "56px 16px 96px 16px" }}>
      
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
        <Box id="older_deposits">
          <Box className="intro" sx={{p:4}}>
            <Typography component="h2" variant="h3" sx={{mt:5}}>
              Pépites déposées plus tôt
            </Typography>
            <Typography component="body" variant="body1">
              Utilise tes points fraichement gagnés pour les découvrir
            </Typography>
          </Box>

          <Box
            id="older_deposits_list"
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
      )}
    </Box>
  );
}
