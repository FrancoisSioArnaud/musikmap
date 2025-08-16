import React, { useState, useEffect, useContext } from "react";
import { UserContext } from "../UserContext";
import Box from "@mui/material/Box";
import MenuAppBar from "../Menu";
import LiveSearch from "./LiveSearch";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { checkSpotifyAuthentication } from "./SpotifyUtils";
import { checkDeezerAuthentication } from "./DeezerUtils";
import {
  getBoxDetails,
  setCurrentBoxName,
  updateVisibleDeposits,
} from "./BoxUtils";
import SongCard from "./SongCard";
import Loader from "./Loader";
import BoxStartup from "./OnBoarding/BoxStartup";
import EnableLocation from "./OnBoarding/EnableLocation";
import SongDisplay from "./OnBoarding/SongDisplay";
import DispHiddenSongs from "./OnBoarding/DispHiddenSongs";
import Button from "@mui/material/Button";
import IncentiveNote from "./OnBoarding/IncentiveNote";
// import { ClassNames } from "@emotion/react";

export default function MusicBox() {
  // States & Variables
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);

  const [stage, setStage] = useState(0);
  const navigate = useNavigate();

  // Gets box name from URL
  const { boxName } = useParams();
  // Stores all the information about the box
  const [boxInfo, setBoxInfo] = useState({});
  // Checks if a song has been deposited in the box
  const [isDeposited, setIsDeposited] = useState(false);
  // User Context variables
  const { user } = useContext(UserContext);

  const [dispSong, setDispSong] = useState("");

  const [searchSong, setSearchSong] = useState("");

  // The ID of the user who has deposited the music selected by the current user
  const [depositedBy, setDepositedBy] = useState(null);

  // The achievements the user obtains
  const [achievements, setAchievements] = useState({});
  const [revealedDeposit, setRevealedDeposit] = useState({});

  /**
   * Function to be executed when the component is mounted and the page is loaded
   * Check at page load (only) if user is authenticated with spotify and get the box's details
   */
  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
    setCurrentBoxName(boxName);
    // updateVisibleDeposits(boxName);
    getBoxDetails(boxName, navigate)
      .then((data) => {
        setBoxInfo(data);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []); // Empty dependency array ensures the effect is only run once

  return (
    <>
      <MenuAppBar />
      <Box className={`main-content stage-${stage}`}>
        {(stage === 0 || stage === 1) &&
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
        }
        {stage === 2 && (
          <>
            {/* <DispHiddenSongs deposits={boxInfo} isDeposited={isDeposited} /> */}
            <LiveSearch
              isSpotifyAuthenticated={isSpotifyAuthenticated}
              isDeezerAuthenticated={isDeezerAuthenticated}
              boxName={boxName}
              setIsDeposited={setIsDeposited}
              user={user}
              setStage={setStage}
              setSearchSong={setSearchSong}
              setAchievements={setAchievements}
            />
          </>
        )}
        {stage === 3 && (
          <IncentiveNote setStage={setStage}
            searchSong={searchSong}
            setSearchSong={setSearchSong}
            boxInfo={boxInfo}
            setDispSong={setDispSong}
            setDepositedBy={setDepositedBy}
            setAchievements={setAchievements}
            setRevealedDeposit={setRevealedDeposit}
          />
        )}
        {stage === 4 && (
          <>
            <SongCard
              deposits={boxInfo}
              isDeposited={isDeposited}
              setStage={setStage}
              setDispSong={setDispSong}
              searchSong={searchSong}
              setDepositedBy={setDepositedBy}
              setAchievements={setAchievements}
            />
          </>
        )}
        {stage === 5 && (
          <>
            <SongDisplay
              dispSong={dispSong}
              revealedDeposit={revealedDeposit}
              depositedBy={depositedBy}
              achievements={achievements}
            />
          </>
        )}
      </Box>
    </>
  );
}
