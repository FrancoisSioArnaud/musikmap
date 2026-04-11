// frontend/src/components/Flowbox/Main.js

import React, { useCallback, useEffect, useRef, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";

import Deposit from "../Common/Deposit";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import LiveSearch from "./LiveSearch";
import { getValid, setWithTTL } from "../Utils/mmStorage";

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 20;

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

async function fetchGetMain(boxSlug) {
  const res = await fetch(`/box-management/get-main/${encodeURIComponent(boxSlug)}/`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`get-main HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  return Array.isArray(data) ? data : [];
}

export default function Main() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};

  const [loading, setLoading] = useState(true);
  const [mainDep, setMainDep] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

  const writeBoxContent = useCallback(
    (partial) => {
      const prev = getValid(KEY_BOX_CONTENT);
      const merged = {
        boxSlug,
        timestamp: Date.now(),
        main: partial.main ?? prev?.main ?? null,
        myDeposit: partial.myDeposit ?? prev?.myDeposit ?? null,
        successes: Array.isArray(partial.successes)
          ? partial.successes
          : Array.isArray(prev?.successes)
            ? prev.successes
            : [],
        olderDeposits: Array.isArray(partial.olderDeposits)
          ? partial.olderDeposits
          : Array.isArray(prev?.olderDeposits)
            ? prev.olderDeposits
            : [],
      };

      setWithTTL(KEY_BOX_CONTENT, merged, TTL_MINUTES);
      return merged;
    },
    [boxSlug]
  );

  const initialFlow = useCallback(async () => {
    setLoading(true);

    let pos;
    try {
      pos = await getPositionOnce();
    } catch {
      goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
      return;
    }

    try {
      const res = await verifyLocationWithServer(boxSlug, pos.coords);
      if (res.status === 200) {
        try {
          const arr = await fetchGetMain(boxSlug);
          if (!arr || arr.length === 0) {
            goOnboardingWithError("Erreur, cette boîte est vide");
            return;
          }

          const main = arr[0];
          const olderDeposits = arr.slice(1);

          setMainDep(main);
          setLoading(false);
          writeBoxContent({ main, olderDeposits });
        } catch {
          goOnboardingWithError("Erreur de vérification de localisation");
        }
        return;
      }

      if (res.status === 403) {
        goOnboardingWithError("tu dois être à côté de la boîte pour pouvoir y accéder");
        return;
      }

      if (res.status === 401) {
        goOnboardingWithError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
        return;
      }

      goOnboardingWithError("Erreur de vérification de localisation");
    } catch {
      goOnboardingWithError("Erreur de vérification de localisation");
    }
  }, [boxSlug, goOnboardingWithError, writeBoxContent]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!cancelled) {
        await initialFlow();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialFlow]);

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
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(tick, 100000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loading, boxSlug, goOnboardingWithError]);

  const openSearch = () => {
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

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

      <Box sx={{ p: 5, mb: "84px" }}>
        {mainDep && (
          <Deposit dep={mainDep} user={user} variant="main" showPlay={true} showUser={true} />
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

        <Box component="main" sx={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
          <Box sx={{ boxSizing: "border-box", minHeight: "100%" }}>
            <LiveSearch />
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
