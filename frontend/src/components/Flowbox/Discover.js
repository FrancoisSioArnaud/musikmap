// frontend/src/components/Flowbox/Discover.js

import React, { useCallback, useEffect, useRef, useState, useContext } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

import Deposit from "../Common/Deposit";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";

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
            (err2) => {
              try { navigator.geolocation.clearWatch(wid); } catch {}
              reject(err2);
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

  // On se base sur le code HTTP (200=OK, 403=loin, 404/5xx=erreur générique)
  return res;
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

export default function Discover() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};

  const [loading, setLoading] = useState(true);
  const [mainDep, setMainDep] = useState(null);

  // interval pour re-check (10s)
  const intervalRef = useRef(null);

  const goOnboardingWithError = useCallback((msg) => {
    navigate(`/flowbox/${encodeURIComponent(boxSlug)}`, {
      replace: true,
      state: { error: msg || "Erreur inconnue" },
    });
  }, [navigate, boxSlug]);

  const initialFlow = useCallback(async () => {
    setLoading(true);

    // 1) GPS
    let pos;
    try {
      pos = await getPositionOnce();
    } catch (e) {
      // Refus / timeout / pas de GPS → retour Onboarding
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
          setMainDep(arr[0]);
          setLoading(false);
        } catch (e) {
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
        // 404, 5xx, JSON cassé, etc.
        goOnboardingWithError("Erreur de vérification de localisation");
        return;
      }
    } catch (e) {
      goOnboardingWithError("Erreur de vérification de localisation");
      return;
    }
  }, [boxSlug, goOnboardingWithError]);

  // Mount → lancer le flow initial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await initialFlow();
    })();
    return () => { cancelled = true; };
  }, [initialFlow]);

  // Re-check périodique toutes les 10s (GPS + verify)
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

    // démarrer l’intervalle dès qu’on n’est plus en chargement initial
    if (!loading) {
      intervalRef.current && clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, 10000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loading, boxSlug, goOnboardingWithError]);

  // ----- UI -----
  if (loading) {
    return (
      <Box sx={{ minHeight: "calc(100vh - 64px)", display: "grid", placeItems: "center", p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {mainDep && (
        <Deposit
          dep={mainDep}
          user={user}
          variant="main"
          showReact={true}
          showPlay={true}
          showDate={true}
          showUser={true}
        />
      )}
    </Box>
  );
}
