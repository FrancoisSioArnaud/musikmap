import React, { useState, useEffect, useContext } from "react";
import MenuAppBar from "./Menu";
import { UserContext } from "./UserContext";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import { logoutUser } from "./UsersUtils";
import EditIcon from "@mui/icons-material/Edit";
import Box from "@mui/material/Box";
import { getCookie } from "./Security/TokensUtils";
import { checkUserStatus, setPreferredPlatform } from "./UsersUtils";
import { navigateToCurrentBox } from "./MusicBox/BoxUtils";
import {
  checkDeezerAuthentication,
  authenticateDeezerUser,
  disconnectDeezerUser,
} from "./MusicBox/DeezerUtils";
import {
  checkSpotifyAuthentication,
  authenticateSpotifyUser,
  disconnectSpotifyUser,
} from "./MusicBox/SpotifyUtils";
import { useNavigate } from "react-router-dom";
import CardMedia from "@mui/material/CardMedia";
import LiveSearch from "./MusicBox/LiveSearch";

// Styles
const styles = {
  root: {
    flexGrow: 1,
    padding: "16px",
  },
  avatar: {
    width: "80px",
    height: "80px",
  },
  textField: {
    marginBottom: "16px",
  },
  buttonGroup: {
    marginBottom: "16px",
  },
  buttonConnect: {
    backgroundColor: "transparent",
    color: "gray",
  },
  buttonPlatform: {
    backgroundColor: "transparent",
    color: "gray",
    textTransform: "none",
    fontStyle: "italic",
  },
  image: {
    width: "100px",
    height: "50px",
    marginRight: "8px",
  },
  streamingTitle: {
    marginTop: "24px",
  },
  avatarContainer: {
    position: "relative",
  },
  editIcon: {
    position: "absolute",
    top: "15px",
    right: "0px",
  },
  basicButton: {
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": {
      border: "none",
    },
  },
  musicBox: {
    marginTop: "16px",
    border: "1px solid gray",
    padding: "16px",
    borderRadius: "4px",
    marginBottom: "5px",
  },
  musicBoxTitle: {
    fontSize: "18px",
    fontWeight: "bold",
    marginBottom: "8px",
  },
  musicBoxContent: {
    marginBottom: "8px",
  },
  disconnectButton: {
    margin: "10px 10px",
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": {
      border: "none",
    },
  },
};

export default function UserProfilePage() {
  // States & Variables
  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);

  const [discoveredSongs, setDiscoveredSongs] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);

  const [selectedProvider, setSelectedProvider] = useState("spotify");

  const { user, setUser, setIsAuthenticated } = useContext(UserContext);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [errorMessages, setErrorMessages] = useState([]);

  const [showSearch, setShowSearch] = useState(false);

  const navigate = useNavigate();

  /**
   * Runs the specified callback function after the component has rendered.
   */
  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
    getDiscoveredSongs(setDiscoveredSongs);
  }, []);

  /**
   * Function that handles the click event for the connect button for Spotify.
   */
  const handleButtonClickConnectSpotify = () => {
    authenticateSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
  };

  /**
   * Function that handles the click event for the disconnect button for Spotify.
   */
  const handleButtonClickDisconnectSpotify = () => {
    disconnectSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
    // Relaod the page to update the UI
    window.location.reload();
  };

  /**
   * Function that handles the click event for the connect button for Deezer.
   */
  const handleButtonClickConnectDeezer = () => {
    authenticateDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
  };

  /**
   * Function that handles the click event for the disconnect button for Deezer.
   */
  const handleButtonClickDisconnectDeezer = () => {
    disconnectDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
    // Relaod the page to update the UI
    window.location.reload();
  };

  /**
   * Function that returns the list of discovered songs.
   * @param setDiscoveredSongs - The function to set the list of discovered songs.
   */
  const getDiscoveredSongs = async (setDiscoveredSongs) => {
    // Fetch the list of discovered songs
    const response = await fetch("../box-management/discovered-songs");
    const data = await response.json();
    if (response.ok) {
      setDiscoveredSongs(data);
    } else {
      console.log(data);
    }
  };

  /**
   * Function that handles the change event for the provider selection.
   * @param event - The event that triggered the function call.
   */
  function handleProviderChange(event) {
    setSelectedProvider(event.target.value);
  }

  /**
   * Handles the click event for the "Go to link" button.
   */
  function redirectToLink() {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        song: discoveredSongs[currentSongIndex],
        platform: selectedProvider,
      }),
    };
    // Send the request to the server
    fetch("../api_agg/aggreg", requestOptions)
      .then((response) => response.json())
      .then((data) => {
        window.location.href = data;
      });
  }

  const handlePasswordChange = () => {
    setShowPasswordForm(true);
  };

  const handlePasswordCancel = () => {
    setShowPasswordForm(false);
  };

  /**
   * Sends a password change request to the server and processes the response.
   *
   * @param {FormData} form - The form data containing the password change details.
   * @returns {Promise<void>} - A Promise that resolves when the request is completed.
   */
  const sendAndProcessPasswordChange = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "X-CSRFToken": csrftoken },
      body: form,
    };
    try {
      const response = await fetch("/users/change-password", requestOptions);
      const data = await response.json();
      if (response.ok) {
        setErrorMessages({});
        setShowPasswordForm(false);
        console.log("Password changed successfuly");
      } else {
        if (data.errors) {
          setErrorMessages(data.errors);
        } else {
          console.log(data);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  /**
   * Handles the form submission event for password change.
   *
   * @param {Event} event - The form submission event.
   * @returns {void}
   */
  const handleSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    sendAndProcessPasswordChange(data);
  };

  /**
   * Handles the change event of the avatar input element and uploads the selected file as the user's profile picture.
   * @param {Event} event - The change event object triggered by the avatar input element.
   * @returns {Promise<void>} - A promise that resolves when the profile picture change is completed.
   */
  const handleAvatarChange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const form = new FormData();
      form.append("profile_picture", file);
      const csrftoken = getCookie("csrftoken");
      const requestOptions = {
        method: "POST",
        headers: { "X-CSRFToken": csrftoken },
        body: form,
      };
      try {
        const response = await fetch(
          "/users/change-profile-pic",
          requestOptions
        );
        const data = await response.json();
        if (response.ok) {
          checkUserStatus(setUser, setIsAuthenticated);
          console.log("Profile picture changed successfuly");
        } else {
          if (data.errors) {
            console.log(data.errors);
          } else {
            console.log(data);
          }
        }
      } catch (error) {
        console.error(error);
      }
    }
  };

  /**
   * Handles the change of the preferred platform and updates the user's preferred platform accordingly.
   * @param {string} platform - The new preferred platform value.
   * @returns {void}
   */
  function handlePreferredPlatform(platform) {
    setPreferredPlatform(platform)
      .then(() => {
        checkUserStatus(setUser, setIsAuthenticated);
      })
      .catch(() => {
        console.log("cannot change preferred platform");
      });
  }

  return (
    <>
      <MenuAppBar />
      <div style={styles.root}>
        <Button
          variant="contained"
          onClick={() => navigateToCurrentBox(navigate)}
          style={styles.basicButton}
          sx={{ marginBottom: "12px" }}
        >
          Retourner sur la boîte
        </Button>
        <Grid container spacing={2} alignItems="center">
          <Grid item style={styles.avatarContainer}>
            <input
              accept="image/*"
              id="avatar-input"
              type="file"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
            <label htmlFor="avatar-input">
              <Avatar
                style={styles.avatar}
                src={user.profile_picture}
                alt={user.username}
                component="span"
              />
              <EditIcon style={styles.editIcon} />
            </label>
          </Grid>
          <Grid item>
            <Typography variant="h5">{user.username}</Typography>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Tes informations personnelles
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              style={styles.textField}
              label="Email"
              variant="outlined"
              fullWidth
              value={user.email}
              InputProps={{
                readOnly: true,
              }}
            />
          </Grid>
          {!user.is_social_auth ? (
            <Grid item xs={12} sm={6}>
              <TextField
                style={styles.textField}
                label="Mot de passe"
                variant="outlined"
                fullWidth
                type="password"
                value="*******"
                InputProps={{
                  readOnly: true,
                }}
              />
            </Grid>
          ) : (
            <></>
          )}
        </Grid>
        {!user.is_social_auth ? (
          showPasswordForm ? (
            <Box
              component="form"
              noValidate
              onSubmit={handleSubmit}
              sx={{ mt: 3 }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    required
                    fullWidth
                    name="old_password"
                    label="Ancien mot de passe"
                    type="password"
                    id="oldPassword"
                    autoComplete="current-password"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    required
                    fullWidth
                    name="new_password1"
                    label="Nouveau mot de passe"
                    type="password"
                    id="newPassword1"
                    autoComplete="new-password"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    required
                    fullWidth
                    name="new_password2"
                    label="Confirmation du mot de passe"
                    type="password"
                    id="newPassword2"
                    autoComplete="new-password"
                  />
                </Grid>
              </Grid>
              <Button
                type="submit"
                variant="contained"
                sx={{ mt: 3 }}
                style={styles.basicButton}
              >
                Modifier
              </Button>
              <Button
                variant="contained"
                sx={{ ml: 3, mt: 3 }}
                onClick={handlePasswordCancel}
                style={styles.basicButton}
              >
                Annuler
              </Button>
              {Object.keys(errorMessages).map((key) => (
                <Typography
                  key={key}
                  variant="body2"
                  color="error"
                  align="center"
                >
                  {errorMessages[key]}
                </Typography>
              ))}
            </Box>
          ) : (
            <Button
              variant="contained"
              onClick={handlePasswordChange}
              style={styles.basicButton}
            >
              Modifier le mot de passe
            </Button>
          )
        ) : (
          <Typography variant="body2" align="center">
            Vous êtes connecté avec une plateforme de streaming.
          </Typography>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom>
              Ta chanson préférée
            </Typography>
          </Grid>
          <Grid>
            {user.favorite_song ? (
              <>
                <img src={user.favorite_song.image_url} width={150} />
                <Button
                  variant="contained"
                  onClick={() => setShowSearch(true)}
                  style={styles.basicButton}
                >Change pref song</Button>
              </>
            ) : (
              <Button
                variant="contained"
                onClick={() => setShowSearch(true)}
                style={styles.basicButton}
              >Set pref song</Button>
            )}
            {showSearch && (
              <LiveSearch
                user={user}
                setFavoriteSong={true}
                onSuccess={() => {
                  setShowSearch(false);
                  checkUserStatus(setUser, setIsAuthenticated);
                }}
              />
            )}
          </Grid>
        </Grid>
        <Grid
          container
          spacing={2}
          alignItems="center"
          style={styles.buttonGroup}
        >
          <Grid item>
            <>
              <Typography variant="h6" style={styles.streamingTitle}>
                Tes services de streaming
              </Typography>
              <Typography variant="subtitle1" gutterBottom>
                Ta plateforme principale est celle utilisée pour la recherche
              </Typography>
            </>
          </Grid>

          <Grid
            container
            spacing={2}
            alignItems="center"
            style={styles.buttonGroup}
          >
            <Grid item>
              <img
                src="../static/images/spotify_logo.svg"
                alt="Spotify"
                style={styles.image}
              />
            </Grid>
            <Grid item>
              {isSpotifyAuthenticated ? (
                <Button
                  variant="contained"
                  style={styles.buttonConnect}
                  onClick={handleButtonClickDisconnectSpotify}
                >
                  Se déconnecter
                </Button>
              ) : (
                <Button
                  variant="contained"
                  style={styles.buttonConnect}
                  onClick={handleButtonClickConnectSpotify}
                >
                  Se connecter
                </Button>
              )}
            </Grid>
            <Grid item>
              {user.preferred_platform === "spotify" ? (
                <Typography variant="subtitle1">
                  Plateforme principale
                </Typography>
              ) : (
                <Button
                  variant="contained"
                  style={styles.buttonPlatform}
                  onClick={() => handlePreferredPlatform("spotify")}
                >
                  Choisir comme plateforme principale
                </Button>
              )}
            </Grid>
          </Grid>

          <Grid
            container
            spacing={2}
            alignItems="center"
            style={styles.buttonGroup}
          >
            <Grid item>
              <img
                src="../static/images/deezer_logo.svg"
                alt="Deezer"
                style={styles.image}
              />
            </Grid>
            <Grid item>
              {isDeezerAuthenticated ? (
                <Button
                  variant="contained"
                  style={styles.buttonConnect}
                  onClick={handleButtonClickDisconnectDeezer}
                >
                  Se déconnecter
                </Button>
              ) : (
                <Button
                  variant="contained"
                  style={styles.buttonConnect}
                  onClick={handleButtonClickConnectDeezer}
                >
                  Se connecter
                </Button>
              )}
            </Grid>
            <Grid item>
              {user.preferred_platform === "deezer" ? (
                <Typography variant="subtitle1">
                  Plateforme principale
                </Typography>
              ) : (
                <Button
                  variant="contained"
                  style={styles.buttonPlatform}
                  onClick={() => handlePreferredPlatform("deezer")}
                >
                  Choisir comme plateforme principale
                </Button>
              )}
            </Grid>
          </Grid>
        </Grid>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Box style={styles.musicBox}>
              <Typography variant="h6" style={styles.musicBoxTitle}>
                Chansons découvertes
              </Typography>
              {discoveredSongs.length > 0 ? (
                <div>
                  <Typography variant="body1" style={styles.musicBoxContent}>
                    <strong>Titre :</strong>{" "}
                    {discoveredSongs[currentSongIndex].title}
                  </Typography>
                  <Typography variant="body1" style={styles.musicBoxContent}>
                    <strong>Artiste :</strong>{" "}
                    {discoveredSongs[currentSongIndex].artist}
                  </Typography>
                  <CardMedia
                    component="img"
                    sx={{ width: 150 }}
                    image={discoveredSongs[currentSongIndex].image_url}
                    alt="Track cover"
                  />
                  <Box
                    sx={{
                      flex: "1 0 auto",
                      display: "flex",
                      alignItems: "center",
                      pl: 1,
                      pb: 1,
                    }}
                  >
                    <select
                      value={selectedProvider}
                      onChange={handleProviderChange}
                    >
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
                </div>
              ) : (
                <Typography variant="body1" style={styles.musicBoxContent}>
                  Vous n'avez pas encore découvert de chansons.
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs={12}>
            <Box style={styles.navigationButtons}>
              <Button
                variant="contained"
                color="primary"
                disabled={
                  currentSongIndex === 0 || discoveredSongs.length === 0
                }
                onClick={() => setCurrentSongIndex(currentSongIndex - 1)}
              >
                Chanson précédente
              </Button>
              <Button
                variant="contained"
                color="primary"
                disabled={
                  currentSongIndex === discoveredSongs.length - 1 ||
                  discoveredSongs.length === 0
                }
                onClick={() => setCurrentSongIndex(currentSongIndex + 1)}
              >
                Chanson suivante
              </Button>
            </Box>
          </Grid>
        </Grid>
        <Button
          variant="contained"
          onClick={() => logoutUser(setUser, setIsAuthenticated)}
          style={styles.disconnectButton}
        >
          Déconnexion
        </Button>
      </div>
    </>
  );
}
