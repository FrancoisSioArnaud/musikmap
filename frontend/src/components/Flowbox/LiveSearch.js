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
import { useLocation, useNavigate } from "react-router-dom";

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { getValid, setWithTTL } from "../Utils/mmStorage";

const KEY_MAIN = "mm_main_snapshot";
const KEY_OLDER = "mm_older_snapshot";
const TTL_MINUTES = 20;

export default function LiveSearch({
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxSlug,
  user,
  onDepositSuccess, // (maintenu pour compat, non utilisé ici)
  onClose,          // idem
}) {
  const { setUser } = useContext(UserContext) || {};
  const navigate = useNavigate();
  const location = useLocation();

  const [searchValue, setSearchValue] = useState("");
  const [jsonResults, setJsonResults] = useState([]);
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    user?.preferred_platform || "spotify"
  );

  const [isSearching, setIsSearching] = useState(false);
  const [postingId, setPostingId] = useState(null); // pour désactiver le bouton pendant la navigation

  // Préférence utilisateur
  useEffect(() => {
    if (user?.preferred_platform) {
      setSelectedStreamingService(user.preferred_platform);
    }
  }, [user?.preferred_platform]);

  // Recherche (debounce simple)
  useEffect(() => {
    const timer = setTimeout(() => {
      const doFetch = async () => {
        try {
          setIsSearching(true);

          if (selectedStreamingService === "spotify") {
            if (searchValue === "") {
              if (isSpotifyAuthenticated) {
                const r = await fetch("/spotify/recent-tracks");
                const j = await r.json();
                setJsonResults(Array.isArray(j) ? j : []);
              } else {
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
    if (!value) return;
    setSelectedStreamingService(value);
    setJsonResults([]);
  };

  // NAVIGATE immédiat vers Discover (option B)
  const goCreateDepositFlow = (option) => {
    setPostingId(option?.id ?? "__posting__");

    // Facultatif: vérifie qu'on a bien un snapshot Main (normalement écrit par Main)
    const mainSnap = getValid(KEY_MAIN);
    if (!mainSnap || mainSnap.boxSlug !== boxSlug) {
      // Ce n’est pas bloquant (Discover redirigera vers Onboarding si besoin)
      // On pourrait aussi l’écrire ici si on l’avait sous la main.
    }

    navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover?drawer=achievements&mode=deposit`, {
      state: {
        action: "createDeposit",
        payload: { option, boxSlug },
        origin: location.pathname + location.search,
      },
      replace: false,
    });

    // on réactive rapidement le bouton (la page va changer)
    setTimeout(() => setPostingId(null), 300);
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: "100%" }}>
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3" sx={{mb:3}}>
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
            inputProps={{ inputMode: "search" }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="medium" />
                </InputAdornment>
              ),
            }}
            sx={{
              borderRadius:16,
              "& .MuiInputBase-input": { fontSize: 16 },
            }}
          />
        </Stack>
      </Paper>

      {isSearching && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      <Paper variant="outlined" sx={{ overflowX: "hidden" }}>
        <List disablePadding>
          {jsonResults.map((option) => {
            const isPosting = postingId === (option?.id ?? "__posting__");
            return (
              <ListItem
                key={option.id}
                divider
                sx={{ overflow: "hidden", alignItems: "center" }}
                secondaryAction={
                  <Button
                    variant="contained"
                    size="small"
                    disabled={isPosting}
                    onClick={() => goCreateDepositFlow(option)}
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
                <Box
                  sx={{
                    width: 64, height: 64, borderRadius: 1, overflow: "hidden",
                    flexShrink: 0, bgcolor: "action.hover", mr: 2,
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

                <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, mr: 2, flex: 1, overflow: "hidden" }}>
                  <Typography
                    component="h3" variant="h6" noWrap
                    sx={{ fontWeight: 700, textAlign: "left", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
                    title={option?.name || ""}
                  >
                    {option?.name || ""}
                  </Typography>
                  <Typography
                    component="p" variant="body2" color="text.secondary" noWrap
                    sx={{ textAlign: "left", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}
                    title={option?.artist || ""}
                  >
                    {option?.artist || ""}
                  </Typography>
                </Box>
              </ListItem>
            );
          })}
        </List>
      </Paper>
    </Stack>
  );
}
