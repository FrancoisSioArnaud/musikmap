import * as React from "react";
import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";
import { getCookie } from "../../Security/TokensUtils";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import { getUserDetails } from "../../UsersUtils";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { checkUserStatus } from "../../UsersUtils";
import { UserContext } from "../../UserContext";

/**
 * SongCard Component
 * Displays a card representing a song with its title, artist, and album cover image.
 * @param {Object} deposits - An object containing song deposit data.
 * @param {boolean} isDeposited - A boolean indicating whether the song has been deposited.
 * @param setStage - A function used to set the stage of the page
 * @param setDispSong - A function used to set the song that we will display
 * @param searchSong
 * @returns {JSX.Element} - JSX element representing the SongCard component.
 */
export default function SongDisplay({ dispSong, depositedBy, achievements, revealedDeposit }) {
  // States
  const [selectedProvider, setSelectedProvider] = useState("spotify");

  const { isAuthenticated, setUser, setIsAuthenticated } =
    useContext(UserContext);

  // Stores all the information about the user who has deposited the song
  const [userInfo, setUserInfo] = useState({});

  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  /**
   * Handles the click event for the "Go to link" button.
   */
  function redirectToLink(provider) {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        song: dispSong,
        platform: provider,
      }),
    };

    fetch("../api_agg/aggreg", requestOptions)
      .then((response) => response.json())
      .then((data) => {
        const deepLink = data;

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        if (isIOS) {
          window.location = deepLink;

          let navigationTimer;

          const checkNavigationTimeout = () => {
            clearTimeout(navigationTimer);
            setTimeout(() => {
              window.removeEventListener("pageshow", checkNavigationTimeout);
              const webVersion = deepLink.replace(`${provider}://`, `https://open.${provider}.com/`);
              window.location = webVersion;
            }, 2000); // Fallback to external URL if the app didn't open within 2 seconds
          };

          window.addEventListener("pageshow", () => {
            clearTimeout(navigationTimer);
            window.removeEventListener("pageshow", checkNavigationTimeout);
          });

          navigationTimer = setTimeout(() => {
            checkNavigationTimeout(); // Check for successful navigation to the deep link after 2 seconds
          }, 2000);
        } else {
          window.open(deepLink, '_blank');
        }
      });
  }

  function copyToClipboard(title, artist) {
    navigator.clipboard.writeText(title + ' : ' + artist);
  }

  // Gets the info of the user who has depisoted the song discovered and update the points of the current user
  useEffect(() => {
    getUserDetails(depositedBy, navigate)
      .then((data) => {
        setUserInfo(data);
      })
      .catch((error) => {
        console.error(error);
      });
    checkUserStatus(setUser, setIsAuthenticated);
  }, []);

  return (

    <div className="reveal">

      <div className="reveal__notification">
        Ta chanson a été déposée avec succès 👍
      </div>

      <h1>Bonne écoute !</h1>
      <p>Découvre la chanson qui était dans la boîte avant que tu la remplaces.</p>


      <div className="song__cover">
        <div className="song__cover__image">
          <CardMedia
            component="img"
            sx={{ width: 168 }}
            image={dispSong.image_url}
            alt="Track cover"
          />
          <p className="song__title">{dispSong.title}</p>
        </div>
      </div>

      <div className="song__information">
        <h1>{dispSong.title}</h1>
        <p>{dispSong.artist}</p>
      </div>

      <div className="select-service-provider">

        <button className="label"
          onClick={() => {
            handleSelectProvider('spotify')
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Ecouter la chanson sur...
        </button>

        <div className="wrapper">
          <div className="d-flex">
            <button onClick={() => {
              redirectToLink('spotify')
            }}>
              <span className="sr-only">Spotify</span>
              <img className="spotify" src="/static/images/spotify-logo.svg" alt="" />
            </button>
            <button onClick={() => {
              redirectToLink('deezer')
            }}>
              <span className="sr-only">Deezer</span>
              <img className="deezer" src="/static/images/deezer-logo.svg" alt="" />
            </button>
          </div>
        </div>

        <button className="copy-to-clipboard"
          onClick={() => {
            copyToClipboard(dispSong.title, dispSong.artist)
          }}>
          Copier le nom de la chanson et de l'artiste
        </button>

      </div>

      <h3>Chanson déposée par</h3>

      <div className="author d-flex">
        {userInfo ? (
          <>
            <Avatar
              src={userInfo.profile_picture}
              alt={userInfo.username}
              sx={{
                width: "68px",
                height: "68px",
              }}
            />
            <div className="author__informations">
              <p className="author__informations__name">{userInfo.username}</p>
              <button
                onClick={() => navigate("/profile/" + depositedBy)}
                className="author__informations__link"
              >
                Voir le profil
              </button>
            </div>
            <p className="deposit-number">
              {userInfo.total_deposits + "ème dépôt"}
            </p>
          </>
        ) : (
          <>
            <Avatar
              sx={{
                width: "68px",
                height: "68px",
              }}
            />
            <div className="author__informations">
              <p className="author__informations__name">Utilisateur anonyme</p>
            </div>
          </>
        )}
      </div>

      {revealedDeposit?.note_display && (
        <div className="last-deposit">
          {revealedDeposit.note_display}
        </div>
      )}

      {/* <Box
          sx={{
            marginTop: 2,
            overflow: "auto",
            maxHeight: 200,
            borderRadius: "borderRadius",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <List sx={{ padding: 1 }}>
            {Object.keys(achievements).map((achievementKey) => {
              const achievement = achievements[achievementKey];

              return (
                <ListItem key={achievementKey} disablePadding>
                  <ListItemText
                    primary={achievement.name}
                    secondary={achievement.desc}
                  />
                  <Typography variant="body2">
                    Points gagnés: {achievement.points}
                  </Typography>
                </ListItem>
              );
            })}
          </List>
        </Box> */}


    </div>



  );
}

