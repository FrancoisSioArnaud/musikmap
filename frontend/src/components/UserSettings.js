// frontend/src/components/UserSettings.js
import React, { useState, useContext } from "react";
import { UserContext } from "./UserContext";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
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
import { useEffect } from "react";
import { logoutUser } from "./UsersUtils";

const styles = {
  root: { flexGrow: 1, padding: "16px" },
  avatar: { width: "80px", height: "80px" },
  textField: { marginBottom: "16px" },
  buttonGroup: { marginBottom: "16px" },
  buttonConnect: { backgroundColor: "transparent", color: "gray" },
  buttonPlatform: {
    backgroundColor: "transparent",
    color: "gray",
    textTransform: "none",
    fontStyle: "italic",
  },
  image: { width: "100px", height: "50px", marginRight: "8px" },
  streamingTitle: { marginTop: "24px" },
  avatarContainer: { position: "relative" },
  editIcon: { position: "absolute", top: "15px", right: "0px" },
  basicButton: {
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": { border: "none" },
  },
  disconnectButton: {
    margin: "10px 10px",
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": { border: "none" },
  },
};

export default function UserSettings() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);

  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [errorMessages, setErrorMessages] = useState({});
  const [selectedProvider, setSelectedProvider] = useState("spotify");

  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
  }, []);

  // ---- Streaming auth handlers
  const handleButtonClickConnectSpotify = () =>
    authenticateSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
  const handleButtonClickDisconnectSpotify = () => {
    disconnectSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
    window.location.reload();
  };
  const handleButtonClickConnectDeezer = () =>
    authenticateDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
  const handleButtonClickDisconnectDeezer = () => {
    disconnectDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
    window.location.reload();
  };
  const handleProviderChange = (e) => setSelectedProvider(e.target.value);
  function handlePreferredPlatform(platform) {
    setPreferredPlatform(platform)
      .then(() => checkUserStatus(setUser, setIsAuthenticated))
      .catch(() => console.log("cannot change preferred platform"));
  }

  // ---- Password change
  const handlePasswordChange = () => setShowPasswordForm(true);
  const handlePasswordCancel = () => setShowPasswordForm(false);
  const sendAndProcessPasswordChange = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = { method: "POST", headers: { "X-CSRFToken": csrftoken }, body: form };
    try {
      const response = await fetch("/users/change-password", requestOptions);
      const data = await response.json();
      if (response.ok) {
        setErrorMessages({});
        setShowPasswordForm(false);
      } else {
        if (data.errors) setErrorMessages(data.errors);
        else console.log(data);
      }
    } catch (e) {
      console.error(e);
    }
  };
  const handleSubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    sendAndProcessPasswordChange(data);
  };

  // ---- Avatar upload
  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("profile_picture", file);
    const csrftoken = getCookie("csrftoken");
    const requestOptions = { method: "POST", headers: { "X-CSRFToken": csrftoken }, body: form };
    try {
      const response = await fetch("/users/change-profile-pic", requestOptions);
      const data = await response.json();
      if (response.ok) checkUserStatus(setUser, setIsAuthenticated);
      else if (data.errors) console.log(data.errors);
      else console.log(data);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={styles.root}>
      <Button
        variant="contained"
        onClick={() => navigateToCurrentBox(window.history.back)}
        style={styles.basicButton}
        sx={{ mb: 2 }}
      >
        Retourner sur la boîte
      </Button>

      {/* Avatar + username (édition via page dédiée) */}
      <Grid container spacing={2} alignItems="center">
