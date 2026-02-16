// frontend/src/components/Flowbox/LiveSearch.js
import React, { useState, useEffect, useContext, useCallback, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
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

const RECHECK_MS = 100000;

function getPositionOnce(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation non supportée"));
      return;
    }
    const base = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000, ...opts };
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        try {
          const wid = navigator.geolocation.watchPosition(
            (pos2) => {
              try {
                navigator.geolocation.clearWatch(wid);
              } catch {}
              resolve(pos2);
            },
            () => {
              try {
                navigator.geolocation.clearWatch(wid);
              } catch {}
              reject(err || new Error("Impossible d’obtenir la position."));
            },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
          );
          setTimeout(() => {
            try {
              navigator.geolocation.clearWatch(wid);
            } catch {}
          }, 15000);
        } catch {
          reject(err || new Error("Impossible d’obtenir la position."));
        }
      },
      base
    );
  });
}

async function verifyLocationWithServer(boxSlug, coords) {
  const csrftoken = getCookie("csrftoken");
  const payload = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    box: { url: boxSlug },
  };
  const res = await fetch(`/box-management/verify-location`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": csrftoken,
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  return res;
}

export default function LiveSearch() {
  const { boxSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(UserContext) || {};

  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState("");

  const [searchValue, setSearchValue] = useState("");
  const [jsonResults, setJsonResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [postingId, setPostingId] = useState(null);

  const intervalRef = useRef(null);

  const goOnboardingWithError = useCallback(
    (msg) => {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}`, {
        replace: true,
        state: { error: msg || "Erreur inconnue" },
      });
    },
    [navigate, boxSlug]
  );

  const runGateOnce = useCallback(async () => {
    setGateLoading(true);
    setGateError("");

    let pos;
    try {
      pos = await getPositionOnce();
    } catch {
      goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
      return false;
    }

    try {
      const res = await verifyLocationWithServer(boxSlug, pos.coords);
      if (res.status === 200) {
        setGateLoading(false);
        setGateError("");
        return true;
      }
      if (res.status === 403) {
        goOnboardingWithError("tu dois être à côté de la boîte pour pouvoir y accéder");
        return false;
      }
      if (res.status === 401) {
        goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
        return false;
      }
      goOnboardingWithError("Erreur de vérification de localisation");
      return false;
    } catch {
      goOnboardingWithError("Erreur de vérification de localisation");
      return false;
    }
  }, [boxSlug, goOnboardingWithError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await runGateOnce();
      if (cancelled) return;

      if (ok) {
        intervalRef.current && clearInterval(intervalRef.current);
        intervalRef.current = setInterval(async () => {
          try {
            const pos = await getPositionOnce().catch(() => null);
            if (!pos) {
              goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
              return;
            }
            const res = await verifyLocationWithServer(boxSlug, pos.coords);
            if (res.status !== 200) {
              if (res.status === 403) {
                goOnboardingWithError("tu dois être à côté de la boîte pour pouvoir y accéder");
              } else if (res.status === 401) {
                goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
              } else {
                goOnboardingWithError("Erreur de vérification de localisation");
              }
            }
          } catch {
            goOnboardingWithError("Erreur de vérification de localisation");
          }
        }, RECHECK_MS);
      }
    })();

    return () => {
      cancelled = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runGateOnce, boxSlug, goOnboardingWithError]);

  useEffect(() => {
    if (gateLoading || gateError) return;

    const timer = setTimeout(() => {
      const doFetch = async () => {
        try {
          setIsSearching(true);
          const preferred = user?.preferred_platform || "spotify";
          const platform = preferred === "deezer" ? "deezer" : "spotify";

          if (platform === "spotify") {
            if (searchValue === "") {
              const r = await fetch("/spotify/recent-tracks");
              const j = await r.json();
              setJsonResults(Array.isArray(j) ? j : []);
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
          } else {
            if (searchValue === "") {
              const r = await fetch("/deezer/recent-tracks");
              const j = await r.json();
              setJsonResults(Array.isArray(j) ? j : []);
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
  }, [searchValue, user?.preferred_platform, gateLoading, gateError]);

  const goCreateDepositFlow = (option) => {
    const id = option?.id ?? "__posting__";
    setPostingId(id);

    const origin = `/flowbox/${encodeURIComponent(boxSlug)}/search${location.search || ""}`;

    navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, {
      replace: false,
      state: {
        action: "createDeposit",
        payload: { option, boxSlug },
        origin,
        from: "search",
      },
    });

    setTimeout(() => setPostingId(null), 300);
  };

  if (gateLoading) {
    return (
      <Box sx={{ minHeight: "calc(100vh - 64px)", display: "grid", placeItems: "center", p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (gateError) {
    return (
      <Box sx={{ minHeight: "calc(100vh - 64px)", display: "grid", placeItems: "center", p: 2 }}>
        <Typography color="error">{gateError}</Typography>
      </Box>
    );
  }

  const anyPosting = postingId !== null;

  return (
    <Stack spacing={2} sx={{ maxWidth: "100%" }}>
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
            Choisis ta chanson à déposer dans la boîte
          </Typography>
          <Typography component="p" variant="body1" sx={{ mb: 3 }}>
            La prochaine personne l’écoutera.
          </Typography>

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
                    disabled={anyPosting}
                    onClick={() => goCreateDepositFlow(option)}
                    sx={{ minWidth: 0 }}
                  >
                    {isPosting ? (
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
                      sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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
