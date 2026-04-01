import * as React from "react";
import { useState, useContext, useMemo } from "react";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { UserContext } from "./UserContext";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Link from "@mui/material/Link";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import CircularProgress from "@mui/material/CircularProgress";
import { checkUserStatus } from "./UsersUtils";
import { getCookie } from "./Security/TokensUtils";
import { navigateToCurrentBox } from "./Utils/navigation/boxNavigation";


export default function RegisterPage() {
  const [profilePicture, setProfilePicture] = useState(null);
  const [errorMessages, setErrorMessages] = useState([]);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isGuest = Boolean(user?.is_guest);
  const prefilledUsername = useMemo(
    () => (searchParams.get("prefill_username") || "").trim(),
    [searchParams]
  );

  const handleProfilePictureChange = (event) => {
    const file = event.target.files[0];
    setProfilePicture(file || null);
  };

  const sendAndProcessData = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: {
        "X-CSRFToken": csrftoken,
      },
      credentials: "same-origin",
      body: form,
    };
    try {
      const response = await fetch("/users/register_user", requestOptions);
      const data = await response.json();
      if (response.ok) {
        setErrorMessages({});
        setRegistrationSuccess(true);

        setTimeout(async () => {
          await checkUserStatus(setUser, setIsAuthenticated);
          if (isGuest) {
            navigate("/profile");
          } else {
            navigateToCurrentBox(navigate);
          }
        }, 1200);
      } else if (data.errors) {
        setErrorMessages(data.errors);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (profilePicture) {
      data.append("profile_picture", profilePicture);
    }
    sendAndProcessData(data);
  };

  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: "var(--mm-color_primary)" }}>
          <LockOutlinedIcon />
        </Avatar>
        <Typography component="h1" variant="h5">
          {isGuest ? "Finaliser mon compte" : "S'enregistrer"}
        </Typography>
        {registrationSuccess ? (
          <>
            <Typography variant="body2" color="text.primary" align="center">
              {isGuest ? "Ton compte a été finalisé avec succès !" : "Vous êtes enregistré avec succès !"}
            </Typography>
            <CircularProgress sx={{ color: "var(--mm-color_primary)" }} />
          </>
        ) : (
          <Box component="form" noValidate onSubmit={handleSubmit} sx={{ mt: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  autoComplete="username"
                  name="username"
                  required
                  fullWidth
                  id="username"
                  label="Nom d'utilisateur"
                  autoFocus
                  defaultValue={prefilledUsername}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField required fullWidth id="email" label="Adresse email" name="email" autoComplete="email" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField required fullWidth name="password1" label="Mot de passe" type="password" id="password1" autoComplete="new-password" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField required fullWidth name="password2" label="Confirmation du mot de passe" type="password" id="password2" autoComplete="new-password" />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1">Choisir une image de profil</Typography>
                <input type="file" id="profilePicture" accept=".jpg, .jpeg, .png" onChange={handleProfilePictureChange} />
              </Grid>
            </Grid>
            <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
              {isGuest ? "Finaliser mon compte" : "S'enregistrer"}
            </Button>
            {Object.keys(errorMessages).map((key) => (
              <Typography key={key} variant="body1" color="error" align="center">
                {errorMessages[key][0]}
              </Typography>
            ))}

            {isGuest ? (
              <Grid container justifyContent="center">
                <Grid item>
                  <Link component={RouterLink} to="/login?merge_guest=1" variant="subtitle1">
                    J&apos;ai déjà un compte
                  </Link>
                </Grid>
              </Grid>
            ) : (
              <Grid container justifyContent="flex-end">
                <Grid item>
                  <Link component={RouterLink} to="/login" variant="body2">
                    Vous avez déjà un compte ? S&apos;identifier
                  </Link>
                </Grid>
              </Grid>
            )}
          </Box>
        )}
      </Box>
    </Container>
  );
}
