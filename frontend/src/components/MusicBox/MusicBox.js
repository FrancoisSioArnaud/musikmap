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
import CircularProgress from "@mui/material/CircularProgress";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import { UserContext } from "../UserContext";
import { getCookie } from "../Security/TokensUtils";

// Dialogs UX
import EnableLocation from "./SongDisplay/EnableLocation";
import OutOfRange from "./SongDisplay/OutOfRange";

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

  // ---- UI / flow
  const [geoError, setGeoError] = useState("");
  const [flowStarted, setFlowStarted] = useState(false); // onboarding démarré par clic
  const [showHero, setShowHero] = useState(true);

  // ---- Re-check interval (5s) — activé seulement après démarrage du flow
  const intervalRef = useRef(null);

  // ---- auto scroll quand SongDisplay apparaît
  const hasAutoScrolledRef = useRef(false);

  // ---- ref pour éviter double déclenchement
  const geoRequestInFlightRef = useRef(false);

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

  // ================== 1) Bouton “Ouvrir la boîte” ==================
  const handleOpenBox = useCallback(async () => {
    setFlowStarted(true);
    setGeoError("");

    try {
      const pos = await getPositionOnce(); // déclenche le prompt système si nécessaire
      setPermissionState("granted");
      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);

      if (valid) {
        if (!boxData) {
          setGetBoxLoading(true);
          try {
            const data = await fetchGetBox(boxName);
            setBoxData(data);
          } finally {
            setGetBoxLoading(false);
          }
        }
        setShowHero(false);
      } else {
        // autorisé mais hors zone → on laisse le hero visible, on affiche OutOfRange en dialog
      }
    } catch (e) {
      // souvent "permission denied" → montrer EnableLocation
      setPermissionState((prev) => (prev === "granted" ? "granted" : "prompt"));
      setGeoError(e?.message || "Impossible d’obtenir ta position.");
    }
  }, [boxName, boxData, meta.box]);

  // ================== 2) Re-check périodique (5s) après démarrage du flow ==================
  useEffect(() => {
    function isActive() {
      return flowStarted && permissionState === "granted" && document.visibilityState === "visible";
    }

    async function tick() {
      try {
        if (!isActive() || !meta?.box?.id) return;

        const pos = await getPositionOnce().catch(() => null);
        if (!pos) return;

        const r = await postLocation(meta.box, pos.coords);
        const valid = !!(r.ok && r.data?.valid);

        setInRange(valid);

        // Si on devient in-range pour la 1re fois → fetch + masquer Hero
        if (valid) {
          if (!boxData && !getBoxLoading) {
            setGetBoxLoading(true);
            try {
              const data = await fetchGetBox(boxName);
              setBoxData(data);
            } finally {
              setGetBoxLoading(false);
            }
          }
          if (showHero) setShowHero(false);
        }
      } catch {
        // silencieux
      }
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isActive()) {
      intervalRef.current = setInterval(tick, 5000);
    }

    const onVis = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (isActive()) {
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
  }, [flowStarted, permissionState, meta?.box?.id, boxData, getBoxLoading, boxName, showHero]);

  // ================== 3) Auto-scroll quand SongDisplay est visible ==================
  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (!showHero && permissionState === "granted" && inRange && boxData) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => {
        const anchor = document.getElementById("songdisplay-anchor");
        if (anchor) {
          anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }, [showHero, permissionState, inRange, boxData]);

  // ================== 4) Actions dans les dialogs ==================
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
      if (valid) setShowHero(false);
    },
    [meta?.box, boxData, boxName]
  );

  // iOS-friendly authorize depuis le bouton du dialog
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

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          geoRequestInFlightRef.current = false;
          await processPosition(pos);
        },
        (err) => {
          // Fallback iOS : petit watchPosition pour forcer le prompt
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
      await processPosition(pos);
    } catch (e) {
      setGeoError(e?.message || "Erreur géolocalisation.");
    }
  };

  // ================== 5) UI dérivés ==================
  const depositCount = useMemo(() => Number(meta?.deposit_count || 0), [meta]);
  const boxTitle = useMemo(() => meta?.box?.name || "", [meta]);

  const shouldShowEnableDialog =
    flowStarted && permissionState !== "granted";

  const shouldShowOutOfRangeDialog =
    flowStarted && permissionState === "granted" && !inRange;

  return (
    <Box sx={{ display: "grid", gap: 0, pb: 0 }}>
      {/* ================= HERO (onboarding) ================= */}
      {showHero && (
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
          <Box sx={{ mt: "auto" }}>
            <Box sx={{ display: "grid" }}>
              {/* Count au-dessus du titre */}
              {metaLoading ? (
                <Skeleton variant="text" width={180} height={24} />
              ) : (
                <Typography variant="subtitle1">
                  {depositCount} Dépôts
                </Typography>
              )}

              {/* Titre H1 */}
              {metaLoading ? (
                <Skeleton variant="text" width={260} height={40} />
              ) : (
                <Typography component="h1" variant="h1">
                  {boxTitle}
                </Typography>
              )}

              {/* Bouton Ouvrir la boîte */}
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  size="large"
                  onClick={handleOpenBox}
                  aria-describedby="open-box-desc"
                  fullWidth
                  disabled={metaLoading}
                  startIcon={<PlayArrowIcon />}
                >
                  Ouvrir la boîte
                </Button>
                <Typography id="open-box-desc" variant="caption" sx={{ display: "block", mt: 1, opacity: 0.7 }}>
                  Vérifie ta position pour accéder au contenu
                </Typography>
              </Box>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ================= ANCRE SECTION ================= */}
      <span id="songdisplay-anchor" />

      {/* ================= SECTION SONGDISPLAY ================= */}
      <Box sx={{ position: "relative", minHeight: 400 }}>
        {/* Skeletons visibles seulement si on a commencé le flow et qu’on charge GetBox */}
        {flowStarted && getBoxLoading && (
          <Box sx={{ display: "grid", gap: 2, p: 2 }}>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={320} />
            <Skeleton variant="rounded" height={220} />
          </Box>
        )}

        {/* Affichage du contenu ou OutOfRange (le dialog couvre la page) */}
        {!showHero && permissionState === "granted" && inRange && boxData && (
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

        {/* === Dialogs UX (uniquement après clic) === */}
        <EnableLocation
          open={Boolean(shouldShowEnableDialog)}
          boxTitle={boxTitle || "Boîte"}
          loading={false}
          error={geoError}
          onAuthorize={handleRequestLocation}
          onClose={() => {}}
        />

        <OutOfRange
          open={Boolean(shouldShowOutOfRangeDialog)}
          boxTitle={boxTitle || "Boîte"}
          error={geoError}
          onRetry={handleRetryOutOfRange}
          onClose={() => {}}
        />
      </Box>
    </Box>
  );
}
