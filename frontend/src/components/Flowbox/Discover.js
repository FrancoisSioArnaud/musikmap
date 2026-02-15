import React, { useEffect, useState, useContext, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import Deposit from "../Common/Deposit";
import AchievementsPanel from "./AchievementsPanel";
import { UserContext } from "../UserContext";
import { getValid } from "../Utils/mmStorage";

const KEY_BOX_CONTENT = "mm_box_content";

export default function Discover() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};

  const [boxContent, setBoxContent] = useState(null);

  const redirectOnboardingExpired = useCallback(() => {
    navigate(`/flowbox/${encodeURIComponent(boxSlug)}`, {
      replace: true,
      state: { error: "Erreur pendant le dépôt" }, // message générique demandé
    });
  }, [navigate, boxSlug]);

  useEffect(() => {
    const snap = getValid(KEY_BOX_CONTENT);
    if (!snap || snap.boxSlug !== boxSlug) {
      redirectOnboardingExpired();
      return;
    }
    setBoxContent(snap);
  }, [boxSlug, redirectOnboardingExpired]);

  const myDeposit = boxContent?.myDeposit || null;
  const mainDep = boxContent?.main || null;
  const successes = Array.isArray(boxContent?.successes) ? boxContent.successes : [];
  const olderDeposits = Array.isArray(boxContent?.olderDeposits)
    ? boxContent.olderDeposits
    : [];

  return (
    <Box>
      <Box className="intro">
        <Typography component="h1" variant="h1">
          Bonne écoute !
        </Typography>
      </Box>

      {/* 1) MY DEPOSIT */}
      <Box
        className="intro"
        sx={{
          display: "grid",
          padding: "20px",
          marginTop: "8px",
          textAlign: "center",
        }}
      >
        <Typography component="h2" variant="h3">
          Ta chanson est déposée
        </Typography>
        <Typography component="p" variant="body1">
          La chanson est maintenant dans la boîte. La prochaine personne pourra l’écouter.
        </Typography>

        {myDeposit ? (
          <Box sx={{ mt: 2 }}>
            <Deposit
              dep={myDeposit}
              user={user}
              variant="list"
              showTime={false}
              allowReact={false}
              showPlay={false}
              showUser={false}
            />
          </Box>
        ) : null}
      </Box>

      {/* 2) MAIN */}
      <Box className="intro" sx={{ mt: 2 }}>
        <Typography component="h2" variant="body1">
          La chanson que tu as remplacée
        </Typography>
      </Box>

      {mainDep ? (
        <Box>
          <Deposit
            dep={mainDep}
            user={user}
            variant="list"
            allowReact={true}
            showPlay={true}
            showUser={true}
          />
        </Box>
      ) : null}

      {/* 3) SUCCESSES (inline) */}
      {successes.length > 0 ? (
        <Box sx={{ mt: 3 }}>
          <AchievementsPanel
            successes={successes}
            // si ton AchievementsPanel a besoin d’un CTA, tu peux passer un noop
            onPrimaryCta={() => {}}
          />
        </Box>
      ) : null}

      {/* Older deposits (inchangé) */}
      {olderDeposits.length > 0 ? (
        <Box id="older_deposits">
          <Box className="intro" sx={{ p: 4 }}>
            <Typography component="h2" variant="h3" sx={{ mt: 5 }}>
              Découvre d’autres chansons
            </Typography>
            <Typography component="p" variant="body1">
              Ces chansons ont été déposées plus tôt dans cette boîte. Utilise tes points pour les révéler.
            </Typography>
          </Box>
          <Box id="older_deposits_list">
            {olderDeposits.map((d, idx) => (
              <Deposit
                key={d.public_key || idx}
                dep={d}
                user={user}
                variant="list"
                allowReact={true}
                showPlay={true}
                showUser={true}
              />
            ))}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
