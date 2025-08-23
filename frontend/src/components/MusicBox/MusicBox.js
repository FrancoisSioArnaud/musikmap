import React, { useState, useEffect, useContext } from "react";
import { UserContext } from "../UserContext";
import Box from "@mui/material/Box";
import { useParams, useNavigate } from "react-router-dom";
import { checkSpotifyAuthentication } from "./SpotifyUtils";
import { checkDeezerAuthentication } from "./DeezerUtils";
import { getBoxDetails, setCurrentBoxName } from "./BoxUtils";
import Loader from "./Loader";
import BoxStartup from "./OnBoarding/BoxStartup";
import EnableLocation from "./OnBoarding/EnableLocation";
import SongDisplay from "./OnBoarding/SongDisplay";

export default function MusicBox() {
  // Auth streaming
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);

  // Étapes
  const [stage, setStage] = useState(0); // 0: intro, 1: géoloc, 2: découverte
  const navigate = useNavigate();

  // Param URL
  const { boxName } = useParams();

  // Métadonnées boîte
  const [boxInfo, setBoxInfo] = useState({}); // { box, deposit_count }

  // Contexte user
  const { user } = useContext(UserContext);

  // Dépôts à afficher (dernier + 9 précédents)
  const [dispDeposits, setDispDeposits] = useState([]);

  // Coût reveal (fourni par le back dans GET get-box)
  const [revealCost, setRevealCost] = useState(40);

  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
    setCurrentBoxName(boxName);

    getBoxDetails(boxName, navigate)
      .then((data) => {
        // data attendu: { box, deposit_count, deposits, reveal_cost }
        const meta = {
          box: data?.box || {},
          deposit_count: typeof data?.deposit_count === "number" ? data.deposit_count : 0,
        };
        setBoxInfo(meta);
        setDispDeposits(Array.isArray(data?.deposits) ? data.deposits : []);
        setRevealCost(typeof data?.reveal_cost === "number" ? data.reveal_cost : 40);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [boxName, navigate]);

  return (
    <>
      <Box className={`main-content stage-${stage}`}>
        {(stage === 0 || stage === 1) && (
          <>
            <BoxStartup setStage={setStage} boxInfo={boxInfo} className="startup" />
            <EnableLocation
              className="enable-location"
              setStage={setStage}
              boxInfo={boxInfo}
              navigate={navigate}
            />
            <Loader />
          </>
        )}

        {stage === 2 && (
          <SongDisplay
            // données
            dispDeposits={dispDeposits}
            setDispDeposits={setDispDeposits}
            // pour LiveSearch (drawer dans SongDisplay)
            isSpotifyAuthenticated={isSpotifyAuthenticated}
            isDeezerAuthenticated={isDeezerAuthenticated}
            boxName={boxName}
            user={user}
            revealCost={revealCost}
          />
        )}
      </Box>
    </>
  );
}
