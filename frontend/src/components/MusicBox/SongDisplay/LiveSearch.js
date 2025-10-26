import React, { useState, useEffect, useContext } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";

import { getCookie } from "../../Security/TokensUtils";
import { UserContext } from "../../UserContext";

export default function LiveSearch({
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
  onDepositSuccess, // (addedDeposit, successes) => void
  onClose,          // non utilisé ici, conservé pour compat
}) {
  const { setUser } = useContext(UserContext) || {};

  const [searchValue, setSearchValue] = useState("");
  const [jsonResults, setJsonResults] = useState([]);
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    user?.preferred_platform || "spotify" // par défaut Spotify
  );

  // états UI
  const [isSearching, setIsSearching] = useState(false);
  const [postingId, setPostingId] = useState(null); // id du track en cours de POST (désactive le bouton)

  // Met à jour le service sélectionné si la préférence user change
  useEffect(() => {
    if (user?.preferred_platform) {
      setSelectedStreamingService(user.preferred_platform);
    }
  }, [user?.preferred_platform]);

  // Charger récents / rechercher selon service + saisie (debounce 400ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      const doFetch = async () => {
        try {
          setIsSearching(true);

          // --- SPOTIFY ---
          if (selectedStreamingService === "spotify") {
            if (searchValue === "") {
              if (isSpotifyAuthenticated) {
                const r = await fetch("/spotify/recent-tracks");
                const j = await r.json();
                setJsonResults(Array.isArray(j) ? j : []);
              } else {
                // Non-auth + pas de recherche : rien (conforme à tes consignes)
                setJsonResults([]);
              }
            } else {
              const csrftoken = getCookie("csrftoken");
              const r = await fetch("/spotify/search", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
                body: JSON.stringify({ search_query: searchValue }),
              });
              const j = await r.json();
              setJsonResults(Array.isArray(j) ? j : []);
            }
          }

          // --- DEEZER ---
          if (selectedStreamingService === "deezer") {
            if (searchValue === "") {
              if (isDeezerAuthenticated) {
                const r = await fetch("/deezer/recent-tracks");
                const j = await r.json();
                setJsonResults(Array.isArray(j) ? j : []);
              } else {
                setJsonResults([]);
              }
            } else {
              const csrftoken = getCookie("csrftoken");
              const r = await fetch("/deezer/search", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
                body: JSON.stringify({ search_query: searchValue }),
              });
              const j = await r.json();
              setJsonResults(Array.isArray(j) ? j : []);
            }
          }
        } catch {
          setJsonResults([]);
        } finally {
          setIsSearching(false);
        }
      };

      doFetch();
    }, 400);

    return () => clearTimeout(timer);
  }, [searchValue, selectedStreamingService, isDeezerAuthenticated, isSpotifyAuthenticated]);

  const handleStreamingServiceChange = (_e, value) => {
    if (!value) return; // ToggleButtonGroup peut renvoyer null
    setSelectedStreamingService(value);
    // on efface les résultats pour éviter un mélange de plateformes
    setJsonResults([]);
  };

  // Dépôt POST (Choisir)
  async function handleButtonClick(option, boxName) {
    try {
      setPostingId(option?.id ?? "__posting__");
      const csrftoken = getCookie("csrftoken");

      // Garantir platform_id attendu par le back
      const platformId =
        option.platform_id ??
        (selectedStreamingService === "spotify" ? 1 : 2);

      const data = {
        option: { ...option, platform_id: platformId },
        boxName,
      };

      const res = await fetch("/box-management/get-box?name=" + boxName, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("HTTP " + res.status);
      const payload = await res.json();
      const { added_deposit, successes, points_balance } = payload || {};

      // 1) Notifie SongDisplay -> affichage my_deposit + Achievements
      if (typeof onDepositSuccess === "function") {
        onDepositSuccess(added_deposit, successes);
      }

      // 2) Met à jour le solde global si possible, sinon cumule local pour anonymes
      if (typeof points_balance === "number" && setUser) {
        setUser((prev) => ({ ...(prev || {}), points: points_balance }));
      } else {
        const total =
          (successes || []).find(
            (s) => (s.name || "").toLowerCase() === "total"
          )?.points || 0;
        const key = "anon_points";
        const cur = parseInt(localStorage.getItem(key) || "0", 10);
        localStorage.setItem(key, String(cur + total));
      }
    } catch (err) {
      console.error(err);
      alert("Impossible de déposer cette chanson pour le moment.");
    } finally {
      setPostingId(null);
    }
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: "100%" }}>
      {/* En-tête + sélecteur plateforme */}
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3">
            Choisis ta chanson à déposer
          </Typography>

          <ToggleButtonGroup
            color="primary"
            exclusive
            value={selectedStreamingService}
            onChange={handleStreamingServiceChange}
            aria-label="Choix du service de streaming"
            size="small"
            sx={{ alignSelf: "flex-start", display:"none"}}
          >
            <ToggleButton value="spotify" aria-pressed={selectedStreamingService === "spotify"}>
              Spotify
            </ToggleButton>
            <ToggleButton value="deezer" aria-pressed={selectedStreamingService === "deezer"}>
              Deezer
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            fullWidth
            type="search"
            placeholder="Cherche une chanson"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            inputProps={{
              inputMode: "search",
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="medium" />
                </InputAdornment>
              ),
            }}
            // iOS anti-zoom: police >= 16px sur l'input
            sx={{
              "& .MuiInputBase-input": {
                fontSize: 16,
              },
                borderRadius:"16px";
            }}
          />
        </Stack>
      </Paper>

      {/* Loader recherche */}
      {isSearching && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {/* Résultats */}
      <Paper variant="outlined" sx={{ overflowX: "hidden" }}>
        <List disablePadding>
          {jsonResults.map((option) => {
            const isPosting = postingId === (option?.id ?? "__posting__");

            return (
              <ListItem
                key={option.id}
                divider
                sx={{
                  overflow: "hidden",           // empêche l'étirement horizontal
                  alignItems: "center",
                }}
                secondaryAction={
                  <Button
                    variant="contained"
                    size="small"
                    disabled={isPosting}
                    onClick={() => handleButtonClick(option, boxName)}
                    sx={{ minWidth: 0 }}
                  >
                    {isPosting ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <CircularProgress size={16} />
                        Choisir
                      </Box>
                    ) : (
                      "Choisir"
                    )}
                  </Button>
                }
              >
                {/* Vignette 64px à gauche, carrée, fallback gris clair */}
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 1,
                    overflow: "hidden",
                    flexShrink: 0,
                    bgcolor: "action.hover", // gris light fallback
                    mr: 2,
                  }}
                >
                  {option?.image_url ? (
                    <Box
                      component="img"
                      src={option.image_url}
                      alt={option.name || "Cover"}
                      sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  ) : null}
                </Box>

                {/* Titre (h3) + Artiste (paragraphe) */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    mr: 2,
                    flex: 1,
                    overflow: "hidden", // protège contre les très longues chaînes sans espace
                  }}
                >
                  <Typography
                    component="h3"
                    variant="h6"
                    noWrap
                    sx={{
                      fontWeight: 700,
                      textAlign: "left",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                    title={option?.name || ""}
                  >
                    {option?.name || ""}
                  </Typography>
                  <Typography
                    component="p"
                    variant="body2"
                    color="text.secondary"
                    noWrap
                    sx={{
                      textAlign: "left",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                    title={option?.artist || ""}
                  >
                    {option?.artist || ""}
                  </Typography>
                </Box>
              </ListItem>
            );
          })}
        </List>

        {/* Si pas de résultats: on n’affiche rien (conforme à tes consignes) */}
        {(!isSearching && jsonResults.length === 0) ? null : null}
      </Paper>
    </Stack>
  );
}


