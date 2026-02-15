import React, { useEffect, useState, useContext, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";

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
      state: { error: "Erreur pendant le dépôt" },
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
  const mySong = myDeposit?.song || null;

  const mainDep = boxContent?.main || null;
  const successes = Array.isArray(boxContent?.successes) ? boxContent.successes : [];
  const olderDeposits = Array.isArray(boxContent?.olderDeposits) ? boxContent.olderDeposits : [];

  return (
    <Box>
      {/* 1) MY DEPOSIT (custom, pas un Deposit) */}
      <Box className="my_deposit_notif">
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <CheckCircleIcon fontSize="medium" sx={{width: "1.6em", height: "1.6em"}}/>
          <Typography component="h2" variant="h5">
            Chanson déposée avec succès
          </Typography>
        </Box>

        {mySong ? (
          <Box className="my_deposit deposit deposit_list deposit_song">
            <Box className="img_container">
              {mySong?.image_url ? (
                <Box
                  component="img"
                  src={mySong.image_url}
                  alt={mySong?.title || "Cover"}
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : null}
            </Box>

            <Box className="texts">
              <Typography variant="h5" component="span" title={mySong?.title || ""} className="titre" >
                {mySong?.title || ""}
              </Typography>
              <Typography variant="body1" component="span" title={mySong?.artist || ""} className="artist">
                {mySong?.artist || ""}
              </Typography>
            </Box>
          </Box>
        ) : null}
      </Box>

      {/* 2) MAIN */}
      <Box className="intro">
        <Typography component="h2" variant="h1">
          Bonne écoute !
        </Typography>
        <Typography component="span" variant="body1">
          Découvre la chanson que tu as remplacée
        </Typography>
      </Box>

      {mainDep ? (
        <Box sx={{margin="0 20px"}}>
          <Deposit
            dep={mainDep}
            user={user}
            variant="main"
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
