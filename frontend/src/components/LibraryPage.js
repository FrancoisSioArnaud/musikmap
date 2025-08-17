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
          Ta bibliothèque de découvertes 
        </Typography>
          {discoveredSongs.length > 0 ? (
    discoveredSongs.map((song, index) => (
      <Box
        key={index}
        sx={{
          border: "1px solid lightgray",
          borderRadius: "8px",
          padding: 2,
          marginBottom: 2,
        }}
      >
        <Typography variant="subtitle1">
          <strong>Titre :</strong> {song.title}
        </Typography>
        <Typography variant="subtitle1">
          <strong>Artiste :</strong> {song.artist}
        </Typography>
        {/* Affichage de la pochette, si disponible */}
        <CardMedia
          component="img"
          image={song.image_url}
          alt="Track cover"
          sx={{ width: 150, height: "auto", marginTop: 1 }}
        />
      </Box>
    ))
  ) : (
    <Typography>
      Vous n'avez pas encore découvert de chansons.
    </Typography>
  )}
      </Box>
    </>
  );
}
