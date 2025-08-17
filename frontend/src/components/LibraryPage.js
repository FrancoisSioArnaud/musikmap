import React, { useState, useEffect, useContext } from "react";
import MenuAppBar from "./Menu";
import { UserContext } from "./UserContext";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import CardMedia from "@mui/material/CardMedia";
import { getCookie } from "./Security/TokensUtils";

/**
 * Page qui affiche les chansons découvertes de l'utilisateur.
 */
export default function LibraryPage() {
  // On récupère éventuellement l'utilisateur si on veut afficher son nom ou ses points
  const { user } = useContext(UserContext);

  // États pour stocker les chansons découvertes et l’index courant
  const [discoveredSongs, setDiscoveredSongs] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);

  // État pour savoir si l’on veut ouvrir le lien Spotify ou Deezer
  const [selectedProvider, setSelectedProvider] = useState("spotify");

  // Fonction qui va chercher les chansons découvertes via l’API Django
  async function getDiscoveredSongs() {
    const response = await fetch("../box-management/discovered-songs");
    const data = await response.json();
    if (response.ok) {
      setDiscoveredSongs(data);
    } else {
      console.log(data);
    }
  }

  // Exécuté au premier rendu pour récupérer les chansons
  useEffect(() => {
    getDiscoveredSongs();
  }, []);

  // Gestion du changement de plateforme (Spotify ou Deezer)
  function handleProviderChange(event) {
    setSelectedProvider(event.target.value);
  }

  // Redirige vers Spotify ou Deezer pour écouter la chanson
  function redirectToLink() {
    const csrftoken = getCookie("csrftoken");
    fetch("../api_agg/aggreq", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({
        song: discoveredSongs[currentSongIndex],
        platform: selectedProvider,
      }),
    })
      .then((resp) => resp.json())
      .then((data) => {
        window.location.href = data; // redirige vers le lien retourné par l’API
      });
  }

  return (
    <>
      <MenuAppBar />
      <Box sx={{ padding: 2 }}>
        <Typography variant="h5" gutterBottom>
          Bibliothèque de {user?.username || ""}
        </Typography>
        {discoveredSongs.length > 0 ? (
          <>
            <Typography variant="body1" gutterBottom>
              <strong>Titre :</strong> {discoveredSongs[currentSongIndex].title}
            </Typography>
            <Typography variant="body1" gutterBottom>
              <strong>Artiste :</strong> {discoveredSongs[currentSongIndex].artist}
            </Typography>
            <CardMedia
              component="img"
              sx={{ width: 150, mb: 2 }}
              image={discoveredSongs[currentSongIndex].image_url}
              alt="Track cover"
            />
            <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
              <select value={selectedProvider} onChange={handleProviderChange}>
                <option value="spotify">Spotify</option>
                <option value="deezer">Deezer</option>
              </select>
              <Button
                onClick={redirectToLink}
                sx={{ ml: 2 }}
                variant="contained"
              >
                Aller vers…
              </Button>
            </Box>
            <Grid container spacing={2}>
              <Grid item>
                <Button
                  variant="contained"
                  disabled={currentSongIndex === 0}
                  onClick={() => setCurrentSongIndex(currentSongIndex - 1)}
                >
                  Chanson précédente
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="contained"
                  disabled={
                    currentSongIndex === discoveredSongs.length - 1
                  }
                  onClick={() => setCurrentSongIndex(currentSongIndex + 1)}
                >
                  Chanson suivante
                </Button>
              </Grid>
            </Grid>
          </>
        ) : (
          <Typography>
            Vous n'avez pas encore découvert de chansons.
          </Typography>
        )}
      </Box>
    </>
  );
}
