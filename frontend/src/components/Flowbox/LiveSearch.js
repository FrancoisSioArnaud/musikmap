import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

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

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { setWithTTL } from "../Utils/mmStorage";

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 20;

function normalizeOptionToSong(option) {
  if (!option) return null;
  return {
    title: option.name || null,
    artist: option.artist || null,
    image_url: option.image_url || null,
  };
}

function addAnonPointsFromSuccesses(successes) {
  const sx = Array.isArray(successes) ? successes : [];
  const total =
    sx.find((s) => (s?.name || "").toLowerCase() === "total")?.points ??
    sx.find((s) => (s?.name || "").toLowerCase() === "points_total")?.points ??
    0;

  const key = "anon_points";
  const cur = parseInt(localStorage.getItem(key) || "0", 10);
  localStorage.setItem(key, String(cur + (Number(total) || 0)));
}

export default function LiveSearch({
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
}) {
  const navigate = useNavigate();
  const { boxSlug } = useParams();

  const { user, setUser } = useContext(UserContext) || {};
  const effectiveUser = user || {};

  const [searchValue, setSearchValue] = useState("");
  const [jsonResults, setJsonResults] = useState([]);
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    effectiveUser?.preferred_platform || "spotify"
  );

  const [isSearching, setIsSearching] = useState(false);

  // dépôt (POST)
  const [posting, setPosting] = useState(false);     // disable tous les boutons
  const [postingId, setPostingId] = useState(null);  // loader sur le bouton cliqué

  // Préférence utilisateur (quand UserContext se met à jour)
  useEffect(() => {
    if (effectiveUser?.preferred_platform) {
      setSelectedStreamingService(effectiveUser.preferred_platform);
    }
  }, [effectiveUser?.preferred_platform]);

  // Recherche (debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      const doFetch = async () => {
        try {
          setIsSearching(true);

          if (selectedStreamingService === "spotify") {
            if (searchValue === "") {
              if (isSpotifyAuthenticated) {
                const r = await fetch("/spotify/recent-tracks", {
                  credentials: "same-origin",
                });
                const j = await r.json();
                setJsonResults(Array.isArray(j) ? j : []);
              } else {
                setJsonResults([]);
              }
            } else {
              const csrftoken = getCookie("csrftoken");
              const r = await fetch("/spotify/search", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRFToken": csrftoken,
                },
                body: JSON.stringify({ search_query: searchValue }),
              });
              const j = await r.json();
              setJsonResults(Array.isArray(j) ? j : []);
            }
          }

          if (selectedStreamingService === "deezer") {
            if (searchValue === "") {
              if (isDeezerAuthenticated) {
                const r = await fetch("/deezer/recent-tracks", {
                  credentials: "same-origin",
                });
                const j = await r.json();
                setJsonResults(Array.isArray(j) ? j : []);
              } else {
                setJsonResults([]);
              }
            } else {
              const csrftoken = getCookie("csrftoken");
              const r = await fetch("/deezer/search", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRFToken": csrftoken,
                },
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
  }, [
    searchValue,
    selectedStreamingService,
    isDeezerAuthenticated,
    isSpotifyAuthenticated,
  ]);

  const handleStreamingServiceChange = (_e, value) => {
    if (!value) return;
    setSelectedStreamingService(value);
    setJsonResults([]);
  };

  const goOnboardingWithError = useCallback(
    (msg) => {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}`, {
        replace: true,
        state: { error: msg || "Erreur pendant le dépôt" },
      });
    },
    [navigate, boxSlug]
  );

  const handleDeposit = useCallback(
    async (option) => {
      if (posting) return;

      setPosting(true);
      setPostingId(option?.id ?? "__posting__");

      try {
        const csrftoken = getCookie("csrftoken");
        const body = { option, boxSlug };

        const res = await fetch(`/box-management/get-box/`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error("Erreur pendant le dépôt");
        }

        const data = (await res.json().catch(() => null)) || {};
        const {
          successes = [],
          points_balance = null,
          older_deposits = [],
          main = null,
        } = data;

        // points (connecté) / anon_points (anonyme)
        if (typeof points_balance === "number" && setUser) {
          setUser((prev) => ({ ...(prev || {}), points: points_balance }));
        } else {
          addAnonPointsFromSuccesses(successes);
        }

        // myDeposit minimal (front-only)
        const isoNow = new Date().toISOString();
        const myDeposit = {
          song: normalizeOptionToSong(option),
          deposited_at: isoNow,
        };

        // snapshot LS (TTL 20 min)
        const payload = {
          boxSlug,
          timestamp: Date.now(),
          main: main || null,
          olderDeposits: Array.isArray(older_deposits) ? older_deposits : [],
          successes: Array.isArray(successes) ? successes : [],
          myDeposit,
        };

        setWithTTL(KEY_BOX_CONTENT, payload, TTL_MINUTES);

        // go Discover
        navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, {
          replace: true,
        });
      } catch {
        goOnboardingWithError("Erreur pendant le dépôt");
      } finally {
        setPosting(false);
        setPostingId(null);
      }
    },
    [posting, boxSlug, navigate, setUser, goOnboardingWithError]
  );

  return (
    <Stack spacing={2} sx={{ maxWidth: "100%" }}>
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
            Choisis une chanson à déposer
          </Typography>

          {/* tu l’avais caché; je le laisse inchangé */}
          <ToggleButtonGroup
            color="primary"
            exclusive
            value={selectedStreamingService}
            onChange={handleStreamingServiceChange}
            aria-label="Choix du service de streaming"
            size="small"
            sx={{ alignSelf: "flex-start", display: "none" }}
          >
            <ToggleButton
              value="spotify"
              aria-pressed={selectedStreamingService === "spotify"}
            >
              Spotify
            </ToggleButton>
            <ToggleButton
              value="deezer"
              aria-pressed={selectedStreamingService === "deezer"}
            >
              Deezer
            </ToggleButton>
          </ToggleButtonGroup>

          <TextField
            fullWidth
            type="search"
            placeholder="Chercher une chanson"
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
              borderRadius: 16,
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
            const id = option?.id ?? "__posting__";
            const isThisPosting = posting && postingId === id;

            return (
              <ListItem
                key={id}
                divider
                sx={{ overflow: "hidden", alignItems: "center" }}
                secondaryAction={
                  <Button
                    variant="contained"
                    size="small"
                    disabled={posting} // ✅ disable tous les boutons
                    onClick={() => handleDeposit(option)}
                    sx={{ minWidth: 0 }}
                  >
                    {isThisPosting ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <CircularProgress size={16} />
                        Déposer
                      </Box>
                    ) : (
                      "Déposer"
                    )}
                  </Button>
                }
              >
                <Box
                  sx={{
                    width: 64,
                    height: 64,
                    borderRadius: 1,
                    overflow: "hidden",
                    flexShrink: 0,
                    bgcolor: "action.hover",
                    mr: 2,
                  }}
                >
                  {option?.image_url ? (
                    <Box
                      component="img"
                      src={option.image_url}
                      alt={option.name || "Cover"}
                      sx={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : null}
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    mr: 2,
                    flex: 1,
                    overflow: "hidden",
                  }}
                >
                  <Typography
                    component="h3"
                    variant="h6"
                    noWrap
                    sx={{
                      fontWeight: 700,
                      textAlign: "left",
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
      </Paper>
    </Stack>
  );
}
