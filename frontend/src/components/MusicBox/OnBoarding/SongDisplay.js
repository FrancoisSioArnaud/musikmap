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
 * @param setdispDeposits - A function used to set the song that we will display
 * @param searchSong
 * @param setAchievements
 * @returns {JSX.Element} - JSX element representing the SongCard component.
 */
export default function SongDisplay({ dispDeposits, depositedBy, achievements }) {
  console.log(achievements)
  console.log(dispDeposits)
  // States
  const [selectedProvider, setSelectedProvider] = useState("spotify");

  const { isAuthenticated, setUser, setIsAuthenticated } =
    useContext(UserContext);

  // Stores all the information about the user who has deposited the song
  const [userInfo, setUserInfo] = useState({});

  const navigate = useNavigate();

  /**
   * Handles the click event for the "Go to link" button.
   */
  function redirectToLink() {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        song: dispDeposits,
        platform: selectedProvider,
      }),
    };

    fetch("../api_agg/aggreg", requestOptions)
      .then((response) => response.json())
      .then((data) => {
        console.log(data);
        window.open(data);
      });
  }

  /**
   * Handles the change event for the provider selection dropdown.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The change event object.
   */
  function handleProviderChange(event) {
    setSelectedProvider(event.target.value);
  }

  // Gets the info of the user who has depisoted the song discovered and update the points of the current user
  useEffect(() => {
    getUserDetails(depositedBy, navigate)
      .then((data) => {
        setUserInfo(data);
        // console.log(data);
      })
      .catch((error) => {
        console.error(error);
      });
    checkUserStatus(setUser, setIsAuthenticated);
  }, []); // Empty dependency array ensures the effect is only run once

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "20px",
      }}
    >
      <Card
        sx={{
          display: "flex",
          margin: "auto",
          maxWidth: "fit-content",
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", width: 200 }}>
          <CardContent sx={{ flex: "1 0 auto" }}>
            <Typography component="div" variant="h5">
              {dispDeposits.title}
            </Typography>
            <Typography
              variant="subtitle1"
              color="text.secondary"
              component="div"
            >
              {dispDeposits.artist}
            </Typography>
          </CardContent>
          <Box
            sx={{ display: "flex", alignItems: "center", pl: 1, pb: 1 }}
          ></Box>
          <Box
            sx={{
              flex: "1 0 auto",
              display: "flex",
              alignItems: "center",
              pl: 1,
              pb: 1,
            }}
          >
            <select value={selectedProvider} onChange={handleProviderChange}>
              <option value="spotify">Spotify</option>
              <option value="deezer">Deezer</option>
            </select>
          </Box>
          <Box sx={{ flex: "1 0 auto" }}>
            <button
              onClick={() => {
                redirectToLink();
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              Aller vers ...
            </button>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center" }}>
          <CardMedia
            component="img"
            sx={{ width: 150 }}
            image={dispDeposits.image_url}
            alt="Track cover"
          />
        </Box>
      </Card>
      <Typography variant="h6">Auteur du dépôt :</Typography>
      {userInfo ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
          }}
        >
          <Avatar
            src={userInfo.profile_picture}
            alt={userInfo.username}
            sx={{
              width: "40px",
              height: "40px",
            }}
          />
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "left",
            }}
          >
            <Typography variant="subtitle1">{userInfo.username}</Typography>
            <Typography variant="subtitle2">
              {userInfo.total_deposits + "ème dépôt"}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            onClick={() => navigate("/profile/" + depositedBy)}
            sx={{
              borderRadius: "20px",
              backgroundColor: "white",
              color: "orange",
              border: "none",
              textTransform: "none",
              "&:hover": {
                border: "none",
              },
            }}
          >
            Profil
          </Button>
        </Box>
      ) : (
        <Typography variant="subtitle1">Utilisateur non conneté</Typography>
      )}
      {isAuthenticated ? (
        <Typography variant="h6">Succès débloqués :</Typography>
      ) : (
        <Typography variant="subtitle1">
          Succès débloqués si vous étiez connecté :
        </Typography>
      )}
      <Box
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
      </Box>
    </Box>
  );
}


