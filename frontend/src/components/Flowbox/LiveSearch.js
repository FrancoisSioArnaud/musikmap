import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
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
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { setWithTTL } from "../Utils/mmStorage";

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 120;

function normalizeOptionToSong(option) {
  if (!option) return null;
  return {
    title: option.name || null,
    artist: option.artist || null,
    image_url: option.image_url || null,
  };
}

export default function LiveSearch() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();

  const { user, setUser } = useContext(UserContext) || {};
  const effectiveUser = user || {};

  const [searchValue, setSearchValue] = useState("");
  const [incitationText, setIncitationText] = useState("");
  const [incitationLoading, setIncitationLoading] = useState(true);
  const [jsonResults, setJsonResults] = useState([]);
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    effectiveUser?.preferred_platform || "spotify"
  );

  const [isSearching, setIsSearching] = useState(false);

  // dépôt (POST)
  const [posting, setPosting] = useState(false);
  const [postingId, setPostingId] = useState(null);

  const searchInputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIncitationLoading(true);
        const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
        const response = await fetch(url, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error("Impossible de charger la phrase d’incitation.");
        }

        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        setIncitationText(
          (
            data?.active_incitation?.text ||
            data?.search_incitation_text ||
            ""
          ).trim()
        );
      } catch (_error) {
        if (cancelled) return;
      } finally {
        if (!cancelled) setIncitationLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boxSlug]);

  useEffect(() => {
    if (effectiveUser?.preferred_platform) {
      setSelectedStreamingService(effectiveUser.preferred_platform);
    }
  }, [effectiveUser?.preferred_platform]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const doFetch = async () => {
        const trimmedSearch = searchValue.trim();

        if (!trimmedSearch) {
          setJsonResults([]);
          setIsSearching(false);
          return;
        }

        try {
          setIsSearching(true);

          const csrftoken = getCookie("csrftoken");

          if (selectedStreamingService === "spotify") {
            const r = await fetch("/spotify/search", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
              },
              body: JSON.stringify({ search_query: trimmedSearch }),
            });
            const j = await r.json();
            setJsonResults(Array.isArray(j) ? j : []);
            return;
          }

          if (selectedStreamingService === "deezer") {
            const r = await fetch("/deezer/search", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
              },
              body: JSON.stringify({ search_query: trimmedSearch }),
            });
            const j = await r.json();
            setJsonResults(Array.isArray(j) ? j : []);
            return;
          }

          setJsonResults([]);
        } catch {
          setJsonResults([]);
        } finally {
          setIsSearching(false);
        }
      };

      doFetch();
    }, 400);

    return () => clearTimeout(timer);
  }, [searchValue, selectedStreamingService]);

  const handleStreamingServiceChange = (_e, value) => {
    if (!value) return;
    setSelectedStreamingService(value);
    setJsonResults([]);
  };

  const goOnboardingWithError = useCallback(
    (msg) => {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/`, {
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

        if (setUser) {
          if (data?.current_user) {
            setUser(data.current_user);
          } else if (typeof points_balance === "number") {
            setUser((prev) => ({ ...(prev || {}), points: points_balance }));
          }
        }

        const isoNow = new Date().toISOString();
        const myDeposit = {
          song: normalizeOptionToSong(option),
          deposited_at: isoNow,
        };

        const payload = {
          boxSlug,
          timestamp: Date.now(),
          main: main || null,
          olderDeposits: Array.isArray(older_deposits) ? older_deposits : [],
          successes: Array.isArray(successes) ? successes : [],
          myDeposit,
        };

        setWithTTL(KEY_BOX_CONTENT, payload, TTL_MINUTES);

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
    <Stack spacing={2} sx={{ maxWidth: "100%", height: "calc(100vh - 58px)" }}>
      <Paper sx={{ p: 4, pb: 2 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
            Choisis une chanson à partager
          </Typography>

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
            inputRef={searchInputRef}
            fullWidth
            type="search"
            placeholder="Chercher une chanson"
            value={searchValue}
            className="searchfield"
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
              borderRadius: "var(--mm-radius-round);",
              "& .MuiInputBase-input": { fontSize: 16 },
            }}
          />
        </Stack>
      </Paper>

      <Paper sx={{ overflowX: "hidden", overflowY: "scroll", flex: 1 }}>
        {isSearching ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : jsonResults.length > 0 ? (
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
                      disabled={posting}
                      onClick={() => handleDeposit(option)}
                      sx={{ minWidth: 0 }}
                    >
                      {isThisPosting ? (
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
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
                      borderRadius: "var(--mm-radius-xs)",
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
        ) : incitationLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : incitationText ? (
          <Box
            sx={{
              margin: "0px 16px",
              backgroundColor: "var(--mm-color-secondary-light)",
              padding: "16px 20px",
              borderRadius: "var(--mm-radius-lg)",
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <CampaignRoundedIcon />
            <Typography variant="subtitle1">{incitationText}</Typography>
          </Box>
        ) : null}
      </Paper>
    </Stack>
  );
}
