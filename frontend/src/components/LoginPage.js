import * as React from "react";
import { useState, useContext, useMemo } from "react";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { UserContext } from "./UserContext";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Link from "@mui/material/Link";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import CircularProgress from "@mui/material/CircularProgress";
import { checkUserStatus } from "./UsersUtils";
import { getCookie } from "./Security/TokensUtils";
import { navigateToCurrentBox } from "./Utils/navigation/boxNavigation";

export default function LoginPage() {
  const [authenticationSuccess, setAuthenticationSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Vous vous êtes connecté avec succès !");
  const [errorMessages, setErrorMessages] = useState("");
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const hasGuest = Boolean(user?.is_guest);
  const mergeFlowRequested = searchParams.get("merge_guest") === "1";
  const defaultMergeGuest = useMemo(() => hasGuest, [hasGuest]);

  const sendAndProcessData = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = {
      method: "POST",
      headers: { "X-CSRFToken": csrftoken },
      credentials: "same-origin",
      body: form,
    };
    try {
      const response = await fetch("/users/login_user", requestOptions);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setAuthenticationSuccess(true);
        setErrorMessages("");
        if (data?.merge_error) {
          setSuccessMessage("Connexion réussie, mais la fusion de cet appareil n’a pas pu être effectuée.");
        } else if (data?.guest_merged) {
          setSuccessMessage("Connexion réussie. Les partages de cet appareil ont été ajoutés à ton profil.");
        } else {
          setSuccessMessage("Vous vous êtes connecté avec succès !");
        }

        setTimeout(async () => {
          await checkUserStatus(setUser, setIsAuthenticated);

          const redirectState = location?.state?.from;
          const redirectTarget = redirectState?.pathname
            ? `${redirectState.pathname || ""}${redirectState.search || ""}${redirectState.hash || ""}`
            : (searchParams.get("next") || "");

          if (data?.guest_merged) {
            navigate("/profile");
          } else if (redirectTarget) {
            navigate(redirectTarget);
          } else {
            navigateToCurrentBox(navigate);
          }
        }, 1600);
      } else {
        if (response.status === 401) {
          setErrorMessages("Informations d'identification non valides");
        } else {
          setErrorMessages("Vous êtes déjà connecté");
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    sendAndProcessData(data);
  };

  const handleMultiplatformLogin = (platform) => {
    const next = encodeURIComponent("/profile");
    window.location.assign(`/oauth/login/${platform}/?next=${next}`);
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
          textAlign: "center",
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: "#7BD528" }}>
          <LockOutlinedIcon />
        </Avatar>
        <Typography component="h1" variant="h5">
          Se connecter
        </Typography>
        {authenticationSuccess ? (
          <>
            <Typography variant="body2" color="text.primary" align="center">
              {successMessage}
            </Typography>
            <CircularProgress sx={{ color: "#fa9500" }} />
          </>
        ) : (
          <>
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: "100%" }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Nom d'utilisateur"
                name="username"
                autoComplete="username"
                autoFocus
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Mot de passe"
                type="password"
                id="password"
                autoComplete="current-password"
              />

              {hasGuest && (
                <Box sx={{ mt: 1, textAlign: "left" }}>
                  <FormControlLabel
                    control={<Checkbox name="merge_guest" defaultChecked={defaultMergeGuest} />}
                    label="Ajouter les partages faits avec cet appareil à mon profil"
                  />
                  {mergeFlowRequested && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Tu peux te connecter à ton compte existant puis récupérer les partages, réactions, découvertes et points déjà accumulés sur cet appareil.
                    </Typography>
                  )}
                </Box>
              )}

              <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>
                Se connecter
              </Button>
              <Typography variant="body2" color="error" align="center">
                {errorMessages}
              </Typography>
              <Grid container>
                <Grid item>
                  <Link component={RouterLink} to="/register" variant="h5">
                    {"Tu n'as pas de compte ? Inscris toi"}
                  </Link>
                </Grid>
              </Grid>
              <Typography mt="10px" variant="body1">
                Ou connecte toi avec une plateforme
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "row", gap: "10px", mt: 2 }}>
              <Button variant="outlined" onClick={() => handleMultiplatformLogin("spotify")}>
                Spotify
              </Button>
              <Button variant="outlined" onClick={() => handleMultiplatformLogin("deezer")}>
                Deezer
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Container>
  );
}
