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

import EnableLocation from "./SongDisplay/EnableLocation";
import OutOfRange from "./SongDisplay/OutOfRange";

const SongDisplay = lazy(() => import("./SongDisplay/SongDisplay"));

// ---- Helpers API locales
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

  // ---- Permission / in-range (états "connus" depuis les checks silencieux + rechecks)
  const [permissionState, setPermissionState] = useState("unknown"); // 'granted' | 'prompt' | 'denied' | 'unknown'
  const [inRange, setInRange] = useState(false);

  // ---- Données complètes de la boîte (GetBox)
  const [boxData, setBoxData] = useState(null);
  const [getBoxLoading, setGetBoxLoading] = useState(false);

  // ---- Flow / UI
  const [geoError, setGeoError] = useState("");
  const [enableOpen, setEnableOpen] = useState(false); // bottom sheet EnableLocation
  const [view, setView] = useState("hero"); // 'hero' | 'song' | 'outofrange'
  const [showOlder, setShowOlder] = useState(false);   // older_deposits masqués par défaut

  // ---- Re-check périodique (5s) après sortie du Hero
  const intervalRef = useRef(null);

  // ---- auto scroll quand SongDisplay apparaît
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

  // ================== 1) Check silencieux au mount ==================
  useEffect(() => {
    let cancelled = false;

    async function silentChecks() {
      try {
        if (!("permissions" in navigator) || !navigator.permissions?.query) {
          setPermissionState((prev) => (prev === "granted" ? "granted" : "unknown"));
          return;
        }
        const st = await navigator.permissions.query({ name: "geolocation" });
        if (cancelled) return;

        const nextState = st?.state || "unknown";
        setPermissionState((prev) => (prev === "granted" ? "granted" : nextState));

        if (nextState === "granted" && meta?.box?.id) {
          const pos = await getPositionOnce().catch(() => null);
          if (!pos) return;
          const r = await postLocation(meta.box, pos.coords);
          const valid = !!(r.ok && r.data?.valid);
          if (!cancelled) setInRange(valid);
        }
      } catch {
        // silencieux
      }
    }

    silentChecks();
    return () => { cancelled = true; };
  }, [meta?.box?.id]);

  // ================== 2) Bouton “Ouvrir la boîte” (logique demandée) ==================
  const handleOpenBox = useCallback(async () => {
    setGeoError("");

    // Cas 1: autorisation déjà accordée
    if (permissionState === "granted") {
      if (inRange) {
        // OK → vue SongDisplay, fetch si pas fait
        setView("song");
        if (!boxData && !getBoxLoading) {
          setGetBoxLoading(true);
          try {
            const data = await fetchGetBox(boxName);
            setBoxData(data);
          } finally {
            setGetBoxLoading(false);
          }
        }
      } else {
        // autorisé mais hors zone → OutOfRange
        setView("outofrange");
      }
      return;
    }

    // Cas 2: autorisation pas encore accordée → ouvrir la bottom sheet
    setEnableOpen(true);
  }, [permissionState, inRange, boxData, getBoxLoading, boxName]);

  // ================== 3) Actions depuis EnableLocation (iOS-friendly) ==================
  const processPosition = useCallback(
    async (pos) => {
      setPermissionState("granted");
      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);
      setEnableOpen(false);

      if (valid) {
        setView("song");
        if (!boxData) {
          setGetBoxLoading(true);
          try {
            const data = await fetchGetBox(boxName);
            setBoxData(data);
          } finally {
            setGetBoxLoading(false);
          }
        }
      } else {
        setView("outofrange");
      }
    },
    [meta?.box, boxData, boxName]
  );

  const handleAuthorizeInSheet = useCallback(() => {
    setGeoError("");
    try {
      if (!("geolocation" in navigator)) {
        setGeoError("Geolocation non supportée");
        return;
      }

      const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await processPosition(pos);
        },
        (err) => {
          // Fallback iOS : short watchPosition pour déclencher le prompt
          try {
            const wid = navigator.geolocation.watchPosition(
              async (pos2) => {
                navigator.geolocation.clearWatch(wid);
                await processPosition(pos2);
              },
              (err2) => {
                navigator.geolocation.clearWatch(wid);
                setGeoError(err2?.message || "Impossible d’obtenir ta position.");
              },
              { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
            );
            setTimeout(() => {
              try { navigator.geolocation.clearWatch(wid); } catch {}
            }, 15000);
          } catch (e2) {
            setGeoError(err?.message || "Impossible d’obtenir ta position.");
          }
        },
        opts
      );
    } catch (e) {
      setGeoError(e?.message || "Impossible d’obtenir ta position.");
    }
  }, [processPosition]);

  // ================== 4) Re-check périodique (5s) après sortie du Hero ==================
  useEffect(() => {
    const flowActive = view !== "hero";

    async function tick() {
      try {
        if (!flowActive || permissionState !== "granted" || !meta?.box?.id) return;

        const pos = await getPositionOnce().catch(() => null);
        if (!pos) return;

        const r = await postLocation(meta.box, pos.coords);
        const valid = !!(r.ok && r.data?.valid);
        setInRange(valid);

        if (valid) {
          // si on redevient inRange → revenir à SongDisplay + fetch si besoin
          if (view === "outofrange") setView("song");
          if (!boxData && !getBoxLoading) {
            setGetBoxLoading(true);
            try {
              const data = await fetchGetBox(boxName);
              setBoxData(data);
            } finally {
              setGetBoxLoading(false);
            }
          }
        } else {
          // si on sort de la zone → OutOfRange
          if (view === "song") setView("outofrange");
        }
      } catch {
        // silencieux
      }
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (flowActive) {
      intervalRef.current = setInterval(tick, 5000);
    }

    const onVis = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (flowActive) {
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
  }, [view, permissionState, meta?.box?.id, boxData, getBoxLoading, boxName]);

  // ================== 5) Auto-scroll première fois quand SongDisplay visible ==================
  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (view === "song" && boxData) {
      hasAutoScrolledRef.current = true;
      requestAnimationFrame(() => {
        const anchor = document.getElementById("songdisplay-anchor");
        if (anchor) {
          anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }
  }, [view, boxData]);

  // ================== 6) Retry OutOfRange bouton ==================
  const handleRetryOutOfRange = async () => {
    setGeoError("");
    try {
      const pos = await getPositionOnce();
      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);
      if (valid) {
        setView("song");
        if (!boxData) {
          setGetBoxLoading(true);
          try {
            const data = await fetchGetBox(boxName);
            setBoxData(data);
          } finally {
            setGetBoxLoading(false);
          }
        }
      }
    } catch (e) {
      setGeoError(e?.message || "Erreur géolocalisation.");
    }
  };

  // ================== UI dérivés ==================
  const depositCount = useMemo(() => Number(meta?.deposit_count || 0), [meta]);
  const boxTitle = useMemo(() => meta?.box?.name || "", [meta]);

  return (
    <Box sx={{ display: "grid", gap: 0, pb: 0 }}>
      {/* ================= HERO uniquement quand view === 'hero' ================= */}
      {view === "hero" && (
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
              {metaLoading ? (
                <Skeleton variant="text" width={180} height={24} />
              ) : (
                <Typography variant="subtitle1">{depositCount} Dépôts</Typography>
              )}

              {metaLoading ? (
                <Skeleton variant="text" width={260} height={40} />
              ) : (
                <Typography component="h1" variant="h1">
                  {boxTitle}
                </Typography>
              )}

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
              </Box>
            </Box>
          </Box>
        </Paper>
      )}

      {/* ================= ANCRE + CONTENU uniquement quand on quitte le Hero ================= */}
      {view !== "hero" && (
        <>
          <span id="songdisplay-anchor" />
          <Box sx={{ position: "relative", minHeight: 320, width: "100vw" }}>
            {/* SONGDISPLAY */}
            {view === "song" && (
              <>
                {!boxData || getBoxLoading ? (
                  <Box sx={{ display: "grid", gap: 2, p: 2 }}>
                    <Skeleton variant="rounded" height={120} />
                    <Skeleton variant="rounded" height={320} />
                    <Skeleton variant="rounded" height={220} />
                  </Box>
                ) : (
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
                      showOlder={showOlder}
                      onDeposited={() => setShowOlder(true)}
                    />
                  </Suspense>
                )}
              </>
            )}

            {/* OUT OF RANGE en « état de page » (pas de Hero) */}
            {view === "outofrange" && (
              <OutOfRange
                open={true}
                boxTitle={boxTitle || "Boîte"}
                error={geoError}
                onRetry={handleRetryOutOfRange}
                onClose={() => {}}
              />
            )}
          </Box>
        </>
      )}

      {/* Bottom Sheet EnableLocation — s’ouvre uniquement quand nécessaire */}
      <EnableLocation
        open={enableOpen}
        boxTitle={boxTitle || "Boîte"}
        loading={false}
        error={geoError}
        onAuthorize={handleAuthorizeInSheet}
        onClose={() => setEnableOpen(false)}
      />
    </Box>
  );
}



