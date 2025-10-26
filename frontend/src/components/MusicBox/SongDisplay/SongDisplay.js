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
    <Box sx={{
            p:4,
          }}>
      
      {/* SECTION — MAIN */}
      <MainDeposit
        dep0={dep0}
        user={user}
        boxName={boxName}
        isSpotifyAuthenticated={isSpotifyAuthenticated}
        isDeezerAuthenticated={isDeezerAuthenticated}
        onDeposited={onDeposited}  // <-- prop pour remonter l’info
      />


      {/* SECTION — OLDER DEPOSITS (horizontal scroll, 70vw items) — seulement après dépôt */}
      {showOlder && (
        <Box id="older_deposits" sx={{ mt: 6 /* = 32px si spacing[6]=32 */ }}>
          <Typography component="h2" variant="h3">
            Pépites déposées plus tôt
          </Typography>
          <Typography component="p" variant="body1" sx={{ mt: 3 /* = 12px */ }}>
            Utilise tes points fraîchement gagnés pour les découvrir
          </Typography>
      
          <Box
            id="older_deposits_list"
            sx={{
              mt: 5,                        // 26px si spacing[5] = 26
              display: 'flex',
              flexDirection: 'row',
              gap: 6,                       // 32px
              overflowX: 'auto',
              overflowY: 'hidden',
              px: 4,                        // padding horizontal 16px
              pb: 4,                        // padding bas 16px (espace sous cartes)
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
              // Option : masquer la scrollbar sur WebKit
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {deposits.slice(1).map((dep, idx) => (
              <Box
                key={`dep-${dep?.deposit_id ?? `older-${idx}`}`}
                sx={{
                  flex: '0 0 70vw',         // <-- élément = 70% largeur viewport
                  maxWidth: '70vw',
                  scrollSnapAlign: 'start',
                }}
              >
                <Deposit
                  dep={dep}
                  user={user}
                  setDispDeposits={setDispDeposits}
                  cost={cost}
                  variant="list"
                  showDate={true}
                  showUser={true}
                  fitContainer={true}       // le Card prend 100% du wrapper (70vw)
                />
              </Box>
            ))}
          </Box>
        </Box>
      )}

    </Box>
  );
}
