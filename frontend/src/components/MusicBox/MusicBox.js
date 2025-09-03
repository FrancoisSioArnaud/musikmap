import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
  useContext,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";
import { UserContext } from "../UserContext";
import { getCookie } from "../Security/TokensUtils";

// Chargement différé du SongDisplay
const SongDisplay = lazy(() => import("./SongDisplay/SongDisplay"));

// ---- Helpers API locales (légères)
async function fetchBoxMeta(boxName) {
  try {
    const res = await fetch(`/box-management/meta?name=${encodeURIComponent(boxName)}`, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Meta HTTP ${res.status}`);
    return await res.json(); // { box, deposit_count }
  } catch (e) {
    console.error(e);
    return { box: {}, deposit_count: 0 };
  }
}

async function postLocation(box, coords) {
  const csrftoken = getCookie("csrftoken");
  const payload = {
    latitude: coords.latitude,
    longitude: coords.longitude,
    box: { id: box?.id },
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
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function fetchGetBox(boxName) {
  const res = await fetch(`/box-management/get-box?name=${encodeURIComponent(boxName)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GetBox HTTP ${res.status}`);
  return await res.json(); // { box, deposit_count, deposits, reveal_cost }
}

// ---- Géoloc util
function getPositionOnce(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Geolocation non supportée"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
      ...opts,
    });
  });
}

export default function MusicBox() {
  const navigate = useNavigate();
  const { boxName } = useParams();
  const { user } = useContext(UserContext) || {};

  // ---- Meta (hero)
  const [metaLoading, setMetaLoading] = useState(true);
  const [meta, setMeta] = useState({ box: {}, deposit_count: 0 });

  // ---- Permission / in-range
  const [permissionState, setPermissionState] = useState(
    /** 'granted' | 'prompt' | 'denied' | 'unknown' */ "unknown"
  );
  const [inRange, setInRange] = useState(false);

  // ---- Données complètes de la boîte (GetBox)
  const [boxData, setBoxData] = useState(null); // { box, deposit_count, deposits, reveal_cost }
  const [getBoxLoading, setGetBoxLoading] = useState(false);

  // ---- UI overlays état
  const [geoError, setGeoError] = useState(""); // message d’erreur dernier getCurrentPosition

  // ---- Re-check interval (5s) + visibilité onglet
  const intervalRef = useRef(null);

  // ---- watchPosition id (Patch 2)
  const watchIdRef = useRef(null);

  // ---- ref pour éviter double déclenchement (click + touch)
  const geoRequestInFlightRef = useRef(false);

  // ---- ref pour auto-scroll une seule fois
  const hasAutoScrolledRef = useRef(false);

  // ================== 0) Récup meta (hero) ==================
  useEffect(() => {
    let mounted = true;
    setMetaLoading(true);
    fetchBoxMeta(boxName).then((m) => {
      if (!mounted) return;
      setMeta({ box: m?.box || {}, deposit_count: Number(m?.deposit_count || 0) });
      setMetaLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [boxName]);

  // ================== 1) Auto-ouverture au chargement ==================
  useEffect(() => {
    let cancelled = false;

    async function autoOpenIfAlreadyInRange() {
      if (!meta?.box?.id) return;

      try {
        // --- iOS: Permissions API peut être absente ou retourner toujours "prompt".
        if (!("permissions" in navigator) || !navigator.permissions.query) {
          // ⚠️ Ne pas rétrograder si déjà "granted"
          setPermissionState((prev) => (prev === "granted" ? "granted" : "unknown"));
          return;
        }

        const st = await navigator.permissions.query({ name: "geolocation" });
        if (cancelled) return;

        const nextState = st?.state || "unknown";
        // ⚠️ NE JAMAIS rétrograder: si on a déjà "granted", on garde "granted"
        setPermissionState((prev) => (prev === "granted" ? "granted" : nextState));

        if (nextState !== "granted") return;

        const pos = await getPositionOnce().catch(() => null);
        if (!pos) return;

        const r = await postLocation(meta.box, pos.coords);
        const valid = !!(r.ok && r.data?.valid);
        setInRange(valid);
        if (!valid) return;

        if (!boxData) {
          setGetBoxLoading(true);
          try {
            const data = await fetchGetBox(boxName);
            if (!cancelled) setBoxData(data); // => SongDisplay s’affiche aussitôt
          } finally {
            if (!cancelled) setGetBoxLoading(false);
          }
        }
      } catch {
        // silencieux
      }
    }

    autoOpenIfAlreadyInRange();
    return () => {
      cancelled = true;
    };
  }, [boxName, meta?.box?.id, boxData]);

  // ================== 1.bis) WatchPosition (Patch 2)
  useEffect(() => {
    // Démarre un watch uniquement si permission accordée + box connue + API dispo
    if (permissionState !== "granted" || !meta?.box?.id) return;
    if (!("geolocation" in navigator) || !navigator.geolocation.watchPosition) return;

    // Évite de démarrer plusieurs watchers
    if (watchIdRef.current != null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          const r = await postLocation(meta.box, pos.coords);
          const valid = !!(r.ok && r.data?.valid);
          setInRange(valid);

          // Si on devient in-range et qu'on n'a pas encore les données → fetch GetBox
          if (valid && !boxData && !getBoxLoading) {
            setGetBoxLoading(true);
            try {
              const data = await fetchGetBox(boxName);
              setBoxData(data);
            } finally {
              setGetBoxLoading(false);
            }
          }
        } catch {
          // silencieux
        }
      },
      () => {
        // erreurs watchPosition ignorées (ex: timeout, user cancel)
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [permissionState, meta?.box?.id, boxData, getBoxLoading, boxName]);

  // ================== 2) Bouton “Ouvrir la boîte” => scroll uniquement ==================
  const scrollToContent = useCallback(() => {
    const anchor = document.getElementById("songdisplay-anchor");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ================== 2.bis) Auto-scroll dès que SongDisplay est rendu ==================
  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (permissionState === "granted" && inRange && boxData) {
      hasAutoScrolledRef.current = true;
      // Laisse le temps au DOM d'insérer SongDisplay (lazy + suspense)
      requestAnimationFrame(() => {
        const anchor = document.getElementById("songdisplay-anchor");
        if (anchor) {
          anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }, [permissionState, inRange, boxData]);

  // ================== 3) Re-check périodique (5s) si permission accordée & onglet visible ==================
  useEffect(() => {
    function isActive() {
      return permissionState === "granted" && document.visibilityState === "visible";
    }

    async function tick() {
      try {
        if (!isActive() || !meta?.box?.id) return;

        const pos = await getPositionOnce().catch(() => null);
        if (!pos) return;

        const r = await postLocation(meta.box, pos.coords);
        const valid = !!(r.ok && r.data?.valid);

        if (valid) {
          // Si on devient in-range et qu’on n’a pas encore les données → fetch GetBox
          if (!inRange && !boxData) {
            try {
              setGetBoxLoading(true);
              const data = await fetchGetBox(boxName);
              setBoxData(data);
              console.log(data);
            } catch (e) {
              console.error(e);
            } finally {
              setGetBoxLoading(false);
            }
          }
          setInRange(true);
        } else {
          setInRange(false);
        }
      } catch {
        // silencieux
      }
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // n'active le polling que si aucun watchPosition actif
    if (isActive() && !watchIdRef.current) {
      intervalRef.current = setInterval(tick, 5000); // 5s
    }

    const onVis = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // idem : relance seulement si pas de watch
      if (isActive() && !watchIdRef.current) {
        intervalRef.current = setInterval(tick, 5000);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [permissionState, inRange, boxData, boxName, meta?.box?.id]);

  // ================== 4) Overlays actions (CTA) ==================

  // Helper : traite une position reçue (success getCurrent / watch)
  const processPosition = useCallback(
    async (pos) => {
      setPermissionState("granted");
      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);
      if (valid && !boxData) {
        setGetBoxLoading(true);
        try {
          const data = await fetchGetBox(boxName);
          setBoxData(data);
        } finally {
          setGetBoxLoading(false);
        }
      }
    },
    [meta?.box, boxData, boxName]
  );

  // iOS-friendly: appel direct dans le handler + fallback watchPosition
  const handleRequestLocation = useCallback(() => {
    if (geoRequestInFlightRef.current) return;
    geoRequestInFlightRef.current = true;
    setGeoError("");

    try {
      if (!("geolocation" in navigator)) {
        setGeoError("Geolocation non supportée");
        geoRequestInFlightRef.current = false;
        return;
      }

      const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };

      // 1) Tentative immédiate : getCurrentPosition (lié au geste utilisateur)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          geoRequestInFlightRef.current = false;
          await processPosition(pos);
        },
        (err) => {
          // 2) Fallback iOS : petit watchPosition pour forcer le prompt
          try {
            const wid = navigator.geolocation.watchPosition(
              async (pos2) => {
                navigator.geolocation.clearWatch(wid);
                geoRequestInFlightRef.current = false;
                await processPosition(pos2);
              },
              (err2) => {
                navigator.geolocation.clearWatch(wid);
                geoRequestInFlightRef.current = false;
                setGeoError(err2?.message || "Impossible d’obtenir ta position.");
              },
              { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
            );

            // Sécurité : stop le watch après 15s
            setTimeout(() => {
              try {
                navigator.geolocation.clearWatch(wid);
              } catch {}
              geoRequestInFlightRef.current = false;
            }, 15000);
          } catch (e2) {
            geoRequestInFlightRef.current = false;
            setGeoError(err?.message || "Impossible d’obtenir ta position.");
          }
        },
        opts
      );
    } catch (e) {
      geoRequestInFlightRef.current = false;
      setGeoError(e?.message || "Impossible d’obtenir ta position.");
    }
  }, [processPosition]);

  const handleRetryOutOfRange = async () => {
    setGeoError("");
    try {
      const pos = await getPositionOnce();
      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);
      if (valid && !boxData) {
        setGetBoxLoading(true);
        try {
          const data = await fetchGetBox(boxName);
          setBoxData(data);
        } finally {
          setGetBoxLoading(false);
        }
      }
    } catch (e) {
      setGeoError(e?.message || "Erreur géolocalisation.");
    }
  };

  // ================== 5) UI dérivés ==================
  const depositCount = useMemo(() => Number(meta?.deposit_count || 0), [meta]);
  const boxTitle = useMemo(() => meta?.box?.name || "", [meta]);

  const showEnableLocationOverlay = permissionState !== "granted";
  const showOutOfRangeOverlay = permissionState === "granted" && !inRange;

  return (
    <Box sx={{ display: "grid", gap: 0, pb: 0 }}>
      {/* ================= HERO (meta light) – height: calc(100vh - 64px), contenu en bas ================= */}
      <Paper
        elevation={3}
        sx={{
          height: "calc(100vh - 100px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          p: { xs: 3, md: 5 },
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Contenu poussé en bas */}
        <Box sx={{ mt: "auto" }}>
          <Box sx={{ display: "grid", gap: 2, maxWidth: 960, mx: "auto", textAlign: "center" }}>
            {/* Count au-dessus du titre */}
            {metaLoading ? (
              <Skeleton variant="text" width={180} height={24} sx={{ mx: "auto" }} />
            ) : (
              <Typography variant="subtitle1" sx={{ opacity: 0.8 }}>
                {depositCount} Dépôts
              </Typography>
            )}

            {/* Titre H1 */}
            {metaLoading ? (
              <Skeleton variant="text" width={260} height={40} sx={{ mx: "auto" }} />
            ) : (
              <Typography component="h1" variant="h1" sx={{ fontWeight: 700 }}>
                {boxTitle}
              </Typography>
            )}

            {/* Bouton Ouvrir la boîte (scroll only) */}
            <Box sx={{ pb: { xs: 1, md: 0 } }}>
              <Button
                variant="contained"
                size="large"
                onClick={scrollToContent}
                aria-describedby="open-box-desc"
                fullWidth
                disabled={metaLoading}
                sx={{ py: 1.25 }}
              >
                ⬇︎ Ouvrir la boîte ⬇︎
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* ================= ANCRE SECTION ================= */}
      <span id="songdisplay-anchor" />

      {/* ================= SECTION SONGDISPLAY (skeletons ou contenu) ================= */}
      <Box sx={{ position: "relative", minHeight: 400 }}>
        {/* Skeletons visibles quand on n’a pas encore les données réelles */}
        {!boxData || getBoxLoading ? (
          <Box sx={{ display: "grid", gap: 2, p: 2 }}>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={320} />
            <Skeleton variant="rounded" height={220} />
          </Box>
        ) : null}

        {/* Contenu réel visible seulement si :
            - permission accordée,
            - in-range,
            - boxData prêt.
        */}
        {permissionState === "granted" && inRange && boxData && (
          <Suspense
            fallback={
              <Box sx={{ p: 2 }}>
                <CircularProgress />
              </Box>
            }
          >
            <SongDisplay
              dispDeposits={Array.isArray(boxData?.deposits) ? boxData.deposits : []}
              setDispDeposits={(updater) => {
                setBoxData((prev) => {
                  const prevArr = Array.isArray(prev?.deposits) ? prev.deposits : [];
                  const nextArr = typeof updater === "function" ? updater(prevArr) : updater;
                  return { ...(prev || {}), deposits: nextArr };
                });
              }}
              isSpotifyAuthenticated={false}
              isDeezerAuthenticated={false}
              boxName={boxName}
              user={user}
              revealCost={typeof boxData?.reveal_cost === "number" ? boxData.reveal_cost : 40}
            />
          </Suspense>
        )}

        {/* Overlay: EnableLocation (permission non accordée) */}
        {showEnableLocationOverlay && (
          <Backdrop open sx={{ position: "absolute", inset: 0, zIndex: (t) => t.zIndex.appBar - 1 }}>
            <Paper
              role="dialog"
              aria-modal="true"
              elevation={3}
              sx={{
                p: 3,
                maxWidth: "calc(100vw - 32px)",
                mx: "auto",
                textAlign: "center",
              }}
            >
              <Stack spacing={2}>
                <Button variant="outlined" disabled>
                  {boxTitle || "Boîte"}
                </Button>
                <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
                  Autoriser la localisation
                </Typography>
                <Typography variant="body1">
                  Confirme que tu es bien à côté du spot en partageant ta localisation. Elle est utilisée uniquement
                  pour ouvrir la boîte.
                </Typography>
                {geoError ? (
                  <Typography variant="body2" color="error">
                    {geoError}
                  </Typography>
                ) : null}
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleRequestLocation}
                  onTouchStart={handleRequestLocation}
                >
                  Autoriser
                </Button>
              </Stack>
            </Paper>
          </Backdrop>
        )}

        {/* Overlay: Hors range */}
        {showOutOfRangeOverlay && (
          <Backdrop open sx={{ position: "absolute", inset: 0, zIndex: (t) => t.zIndex.appBar - 1 }}>
            <Paper
              role="dialog"
              aria-modal="true"
              elevation={3}
              sx={{
                p: 3,
                maxWidth: "calc(100vw - 32px)",
                mx: "auto",
                textAlign: "center",
              }}
            >
              <Stack spacing={2}>
                <Button variant="outlined" disabled>
                  {boxTitle || "Boîte"}
                </Button>
                <Typography component="h2" variant="h6" sx={{ fontWeight: 700 }}>
                  Rapproche-toi de la boîte pour voir son contenu
                </Typography>
                {geoError ? (
                  <Typography variant="body2" color="error">
                    {geoError}
                  </Typography>
                ) : null}
                <Stack direction="row" spacing={1} justifyContent="center">
                  <Button variant="outlined" href="" onClick={(e) => e.preventDefault()}>
                    Voir la box sur la carte
                  </Button>
                  <Button variant="contained" onClick={handleRetryOutOfRange}>
                    Réessayer
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Backdrop>
        )}
      </Box>
    </Box>
  );
}


