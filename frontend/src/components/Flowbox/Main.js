// frontend/src/components/Flowbox/Main.js

import React, { useCallback, useEffect, useRef, useState, useContext, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import AlbumIcon from "@mui/icons-material/Album";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";

import Deposit from "../Common/Deposit";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import LiveSearch from "./LiveSearch";

// Helpers localStorage unifié
import { getValid, setWithTTL } from "../Utils/mmStorage";

const KEY_BOX_CONTENT = "mm_box_content"; // clé unique
const TTL_MINUTES = 20;

/** ----- Helpers géoloc (avec fallback iOS) ----- */
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
        // Fallback iOS : watchPosition court pour déclencher le prompt
        try {
          const wid = navigator.geolocation.watchPosition(
            (pos2) => {
              try { navigator.geolocation.clearWatch(wid); } catch {}
              resolve(pos2);
            },
            () => {
              try { navigator.geolocation.clearWatch(wid); } catch {}
              reject(err || new Error("Impossible d’obtenir la position."));
            },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
          );
          setTimeout(() => {
            try { navigator.geolocation.clearWatch(wid); } catch {}
          }, 15000);
        } catch (e2) {
          reject(err || new Error("Impossible d’obtenir la position."));
        }
      },
      base
    );
  });
}

/** ----- POST verify-location (status-only) ----- */
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

  return res; // 200=OK, 403=loin, 401/404/5xx => erreur
}

/** ----- GET main ----- */
async function fetchGetMain(boxSlug) {
  const res = await fetch(`/box-management/get-main/${encodeURIComponent(boxSlug)}/`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`get-main HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

export default function Main() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};

  const [loading, setLoading] = useState(true);
  const [mainDep, setMainDep] = useState(null);

  // Drawer unique
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("search"); // "search" | "achievements"

  // Succès / points (après dépôt)
  const [successes, setSuccesses] = useState([]);

  const totalPoints = useMemo(() => {
    const arr = Array.isArray(successes) ? successes : [];
    const byName = (name) => arr.find((s) => (s?.name || "").toLowerCase() === name);
    return byName("total")?.points ?? byName("points_total")?.points ?? 0;
  }, [successes]);

  // interval pour re-check (10s)
  const intervalRef = useRef(null);

  const goOnboardingWithError = useCallback((msg) => {
    navigate(`/flowbox/${encodeURIComponent(boxSlug)}`, {
      replace: true,
      state: { error: msg || "Erreur inconnue" },
    });
  }, [navigate, boxSlug]);

  // Écrit/merge dans mm_box_content
  const writeBoxContent = useCallback((partial) => {
    const prev = getValid(KEY_BOX_CONTENT);
    const merged = {
      boxSlug,
      timestamp: Date.now(),
      main: partial.main ?? prev?.main ?? null,
      myDeposit: partial.myDeposit ?? prev?.myDeposit ?? null,
      successes: Array.isArray(partial.successes) ? partial.successes : (Array.isArray(prev?.successes) ? prev.successes : []),
      older: Array.isArray(partial.older) ? partial.older : (Array.isArray(prev?.older) ? prev.older : []),
    };
    setWithTTL(KEY_BOX_CONTENT, merged, TTL_MINUTES);
    return merged;
  }, [boxSlug]);

  const initialFlow = useCallback(async () => {
    setLoading(true);

    // 1) GPS
    let pos;
    try {
      pos = await getPositionOnce();
    } catch (e) {
      goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
      return;
    }

    // 2) verify-location
    try {
      const res = await verifyLocationWithServer(boxSlug, pos.coords);
      if (res.status === 200) {
        // 3) get-main
        try {
          const arr = await fetchGetMain(boxSlug);
          if (!arr || arr.length === 0) {
            goOnboardingWithError("Erreur, cette boîte est vide");
            return;
          }

          const main = arr[0];
          const older = arr.slice(1);

          setMainDep(main);
          setLoading(false);

          // ⬇️ Écriture unifiée dans mm_box_content (préserve myDeposit/successes existants)
          const merged = writeBoxContent({ main, older });
          // Option : si tu veux afficher des succès existants dans le drawer local
          setSuccesses(Array.isArray(merged.successes) ? merged.successes : []);
        } catch {
          goOnboardingWithError("Erreur de vérification de localisation");
          return;
        }
      } else if (res.status === 403) {
        goOnboardingWithError("tu dois être à côté de la boîte pour pouvoir y accéder");
        return;
      } else if (res.status === 401) {
        goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
        return;
      } else {
        goOnboardingWithError("Erreur de vérification de localisation");
        return;
      }
    } catch {
      goOnboardingWithError("Erreur de vérification de localisation");
      return;
    }
  }, [boxSlug, goOnboardingWithError, writeBoxContent]);

  // Mount → lancer le flow initial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await initialFlow();
    })();
    return () => { cancelled = true; };
  }, [initialFlow]);

  // Re-check périodique toutes les ~100s (GPS + verify)
  useEffect(() => {
    const tick = async () => {
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
    };

    if (!loading) {
      intervalRef.current && clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, 100000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loading, boxSlug, goOnboardingWithError]);

  /** ---------- Drawer (Search / Achievements) ---------- */
  const openSearch = () => {
    setDrawerView("search");
    setIsDrawerOpen(true);
  };
  const closeDrawer = () => setIsDrawerOpen(false);

  // Après POST réussi (LiveSearch) — (compat, non utilisé avec l’option B)
  const handleDepositSuccess = (_addedDeposit, succ) => {
    setSuccesses(Array.isArray(succ) ? succ : []);
    setDrawerView("achievements");
    setIsDrawerOpen(true);
  };

  const handleBackToBox = () => {
    setIsDrawerOpen(false);
  };

  // ----- UI -----
  if (loading) {
    return (
      <Box sx={{ minHeight: "calc(100vh - 64px)", display: "grid", placeItems: "center", p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box className="intro" sx={{ px: 2, pt: 4 }}>
        <Typography component="h1" variant="h1">
          Bonne écoute !
        </Typography>
        <Typography component="h2" variant="body1">
          Écoute la chanson dans la boîte. Tu peux ensuite la remplacer.
        </Typography>
      </Box>

      <Box sx={{ p: 2, mb: "84px" }}>
        {mainDep && (
          <Deposit
            dep={mainDep}
            user={user}
            variant="main"
            allowReact={true}
            showPlay={true}
            showUser={true}
          />
        )}
      </Box>

      <Button
        fullWidth
        variant="contained"
        size="large"
        onClick={openSearch}
        startIcon={<SearchIcon />}
        className="bottom_fixed"
      >
        Déposer une chanson
      </Button>

      {/* Drawer unique — Search <-> Achievements */}
      <Drawer
        anchor="right"
        open={isDrawerOpen}
        onClose={closeDrawer}
        PaperProps={{
          sx: {
            width: "100vw",
            maxWidth: 560,
            height: "100dvh",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* HEADER du drawer — 51px fixes */}
        <Box
          component="header"
          sx={{
            height: 51,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            px: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            flex: "0 0 auto",
          }}
        >
          <IconButton aria-label="Fermer" onClick={closeDrawer}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* CONTENU plein écran */}
        <Box component="main" sx={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
          <Box sx={{ boxSizing: "border-box", minHeight: "100%" }}>
            {drawerView === "search" ? (
              <LiveSearch
                isSpotifyAuthenticated={true}
                isDeezerAuthenticated={true}
                boxSlug={boxSlug}
                user={user}
                onDepositSuccess={handleDepositSuccess}
                onClose={closeDrawer}
              />
            ) : (
              <AchievementsPanel
                successes={Array.isArray(successes) ? successes : []}
                onPrimaryCta={handleBackToBox}
              />
            )}
          </Box>
        </Box>
      </Drawer>
    </>
  );
}

/* -------- Achievements (masque total/points_total) -------- */
function AchievementsPanel({ successes = [], onPrimaryCta }) {
  const totalPoints =
    successes.find((s) => (s?.name || "").toLowerCase() === "total")?.points ??
    successes.find((s) => (s?.name || "").toLowerCase() === "points_total")?.points ??
    0;

  const listItems = successes.filter((s) => {
    const n = (s?.name || "").toLowerCase();
    return n !== "total" && n !== "points_total";
  });

  return (
    <Box sx={{ display: "grid", gap: 0, pb: "76px" }}>
      <Box className="intro_small" sx={{ px: 3, pt: 3, textAlign: "center" }}>
        <Typography variant="h1" color="rgb(123, 213, 40)">
          Pépite Déposée
        </Typography>

        <Box className="points_container point_container_big" style={{ margin: "12px auto" }}>
          <Typography component="span" variant="body1">+{totalPoints}</Typography>
          <AlbumIcon />
        </Box>
        <Typography component="span" variant="body1">
          ...et plein de points gagnés !
        </Typography>
        <Typography component="span" variant="h5" display="block" sx={{ mt: 1 }}>
          Voici le détail de tes points
        </Typography>
      </Box>

      <List className="success_container">
        {listItems.map((ach, idx) => (
          <ListItem key={idx} className="success" sx={{ pt: 0, pb: 0 }}>
            {typeof ach.emoji === "string" && ach.emoji.trim() !== "" && (
              <Box className="success_design" sx={{ display: "flex", alignItems: "center", gap: 1, mr: 2 }}>
                <Typography variant="body1" className="success_emoji" aria-label={`emoji ${ach.name}`}>
                  {ach.emoji}
                </Typography>
                <Box className="points_container point_container_big">
                  <Typography component="span" variant="body1">+{ach.points}</Typography>
                  <AlbumIcon />
                </Box>
              </Box>
            )}

            <Box className="success_infos" sx={{ minWidth: 0 }}>
              <Typography variant="h3" className="success_title">
                {ach.name}
              </Typography>
              <Typography variant="body1" className="success_desc">
                {ach.desc}
              </Typography>
            </Box>
          </ListItem>
        ))}
      </List>

      <Box className="bottom_fixed" sx={{ p: 2 }}>
        <Button fullWidth variant="contained" onClick={onPrimaryCta}>
          Ok !
        </Button>
      </Box>
    </Box>
  );
}
