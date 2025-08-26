import React, { useEffect, useMemo, useRef, useState, useCallback, lazy, Suspense, useContext } from "react";
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
const SongDisplay = lazy(() => import("./OnBoarding/SongDisplay"));

// ---- Helpers API locales (légères)
async function fetchBoxMeta(boxName, navigate) {
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
  const res = await fetch(`/box-management/getbox?name=${encodeURIComponent(boxName)}`, {
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

  // ---- Ouverture de la section (après clic "Ouvrir la boîte")
  const [sectionOpen, setSectionOpen] = useState(false);

  // ---- Permission / in-range
  const [permissionState, setPermissionState] = useState(/** 'granted' | 'prompt' | 'denied' | 'unknown' */ "unknown");
  const [inRange, setInRange] = useState(false);

  // ---- Données complètes de la boîte (GetBox)
  const [boxData, setBoxData] = useState(null); // { box, deposit_count, deposits, reveal_cost }
  const [getBoxLoading, setGetBoxLoading] = useState(false);

  // ---- UI overlays état
  const [geoError, setGeoError] = useState(""); // message d’erreur dernier getCurrentPosition

  // ---- Re-check interval (5s) + visibilité onglet
  const intervalRef = useRef(null);

  // --- 0) Récup meta (hero)
  useEffect(() => {
    let mounted = true;
    setMetaLoading(true);
    fetchBoxMeta(boxName, navigate).then((m) => {
      if (!mounted) return;
      setMeta({ box: m?.box || {}, deposit_count: Number(m?.deposit_count || 0) });
      setMetaLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [boxName, navigate]);

  // --- 1) Vérif silencieuse de permission au chargement + éventuel pré-chargement
  useEffect(() => {
    let cancelled = false;

    async function checkPermissionAndMaybePreload() {
      try {
        if (!("permissions" in navigator) || !navigator.permissions.query) {
          setPermissionState("unknown");
          return; // pas de prompt auto
        }
        const st = await navigator.permissions.query({ name: "geolocation" });
        if (cancelled) return;

        setPermissionState(st.state); // 'granted' | 'prompt' | 'denied'

        if (st.state === "granted") {
          // Lire position (sans prompt) et vérifier range
          const pos = await getPositionOnce().catch((e) => {
            console.warn("getPosition (granted) error:", e);
            return null;
          });
          if (!pos) return;

          const r = await postLocation(meta.box, pos.coords);
          if (!r.ok) {
            setInRange(false);
            return;
          }
          const valid = !!r.data?.valid;
          setInRange(valid);

          // Pré-charger le GetBox si in-range
          if (valid && !boxData) {
            setGetBoxLoading(true);
            try {
              const data = await fetchGetBox(boxName);
              setBoxData(data);
            } catch (e) {
              console.error(e);
            } finally {
              setGetBoxLoading(false);
            }
          }
        }
        // écouter les changements de permission (facultatif)
        try {
          st.onchange = () => setPermissionState(st.state);
        } catch {}
      } catch (e) {
        console.warn("permissions.query error:", e);
        setPermissionState("unknown");
      }
    }

    checkPermissionAndMaybePreload();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxName, meta.box?.id]); // après meta (pour connaître box.id)

  // --- 2) Click "Ouvrir la boîte" → ouvrir la section
  const openSection = useCallback(() => {
    setSectionOpen(true);
    // scroll jusqu’à l’ancre
    const anchor = document.getElementById("songdisplay-anchor");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // --- 3) Quand la section s’ouvre : si pas de données et permission accordée → on tente loc + GetBox (ou overlays)
  useEffect(() => {
    let cancelled = false;

    async function resolveSectionData() {
      if (!sectionOpen) return;

      // Permission non accordée → on laissera les Skeletons + overlay EnableLocation
      if (permissionState !== "granted") return;

      // Permission accordée → vérifier range
      setGeoError("");
      const pos = await getPositionOnce().catch((e) => {
        if (!cancelled) setGeoError(e?.message || "Impossible d’obtenir ta position.");
        return null;
      });
      if (!pos) {
        setInRange(false);
        return;
      }

      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);

      if (!valid) return;
      if (boxData) return; // déjà pré-chargé

      // Charger GetBox
      setGetBoxLoading(true);
      try {
        const data = await fetchGetBox(boxName);
        if (!cancelled) setBoxData(data);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setGetBoxLoading(false);
      }
    }

    resolveSectionData();
    return () => {
      cancelled = true;
    };
  }, [sectionOpen, permissionState, meta.box, boxData, boxName]);

  // --- 4) Re-check périodique (toutes les 5s) si section ouverte, permission accordée et onglet visible
  useEffect(() => {
    function isActive() {
      return sectionOpen && permissionState === "granted" && document.visibilityState === "visible";
    }

    async function tick() {
      try {
        if (!isActive()) return;
        const pos = await getPositionOnce().catch(() => null);
        if (!pos) return;

        const r = await postLocation(meta.box, pos.coords);
        const valid = !!(r.ok && r.data?.valid);

        if (valid) {
          // Si on vient d’entrer in-range et qu’on n’a pas encore les données → fetch GetBox
          if (!inRange && !boxData) {
            try {
              setGetBoxLoading(true);
              const data = await fetchGetBox(boxName);
              setBoxData(data);
            } catch (e) {
              console.error(e);
            } finally {
              setGetBoxLoading(false);
            }
          }
          setInRange(true);
        } else {
          // Hors range → overlay + Skeletons; on garde les données en mémoire
          setInRange(false);
        }
      } catch (e) {
        // silencieux
      }
    }

    // démarrage / arrêt
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isActive()) {
      intervalRef.current = setInterval(tick, 5000); // 5s
    }

    // écoute visibilité onglet pour activer/désactiver sans re-render
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
  }, [sectionOpen, permissionState, inRange, boxData, boxName, meta.box]);

  // --- UI dérivés
  const depositCount = useMemo(() => Number(meta?.deposit_count || 0), [meta]);
  const boxTitle = useMemo(() => meta?.box?.name || "", [meta]);

  // --- Overlays conditionnels
  const showEnableLocationOverlay = sectionOpen && permissionState !== "granted";
  const showOutOfRangeOverlay = sectionOpen && permissionState === "granted" && !inRange;

  // --- Handlers overlay
  const handleRequestLocation = async () => {
    setGeoError("");
    try {
      const pos = await getPositionOnce();
      // permission accordée → MAJ state et tentative range + GetBox
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
    } catch (e) {
      setGeoError(e?.message || "Impossible d’obtenir ta position.");
    }
  };

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

  return (
    <Box sx={{ display: "grid", gap: 4, pb: 6 }}>
      {/* ================= HERO (meta light) ================= */}
      <Paper elevation={3} sx={{ p: { xs: 3, md: 5 }, position: "relative", overflow: "hidden" }}>
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
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              {boxTitle}
            </Typography>
          )}

          {/* Bouton Ouvrir la boîte */}
          <Box>
            <Button
              variant="contained"
              size="large"
              onClick={openSection}
              aria-describedby="open-box-desc"
              fullWidth
              disabled={metaLoading}
              sx={{ py: 1.25 }}
            >
              ⬇︎ Ouvrir la boîte ⬇︎
            </Button>
            <Typography id="open-box-desc" variant="caption" sx={{ display: "block", mt: 1, opacity: 0.7 }}>
              Fait défiler jusqu’au contenu
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* ================= ANCRE SECTION ================= */}
      <span id="songdisplay-anchor" />

      {/* ================= SECTION SONGDISPLAY (skeletons ou contenu) ================= */}
      <Box sx={{ position: "relative", minHeight: 400 }}>
        {/* 1) Skeletons visibles quand :
              - section ouverte MAIS pas de données (GetBox pas encore chargé),
              - ou permission non accordée,
              - ou hors range.
            */}
        {sectionOpen && (!boxData || getBoxLoading || !inRange || permissionState !== "granted") && (
          <Box sx={{ display: "grid", gap: 2, p: 2 }}>
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={320} />
            <Skeleton variant="rounded" height={220} />
          </Box>
        )}

        {/* 2) Contenu réel (SongDisplay) visible seulement si :
              - section ouverte,
              - permission accordée,
              - in-range,
              - boxData prêt.
            */}
        {sectionOpen && permissionState === "granted" && inRange && boxData && (
          <Suspense fallback={<Box sx={{ p: 2 }}><CircularProgress /></Box>}>
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

        {/* 3) Overlay: EnableLocation (permission non accordée) */}
        {showEnableLocationOverlay && (
          <Backdrop open sx={{ position: "absolute", inset: 0, zIndex: (t) => t.zIndex.modal + 1 }}>
            <Paper
              role="dialog"
              aria-modal="true"
              elevation={3}
              sx={{
                p: 3,
                maxWidth: 560,
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
                <Button variant="contained" size="large" onClick={handleRequestLocation}>
                  Autoriser
                </Button>
              </Stack>
            </Paper>
          </Backdrop>
        )}

        {/* 4) Overlay: Hors range */}
        {showOutOfRangeOverlay && (
          <Backdrop open sx={{ position: "absolute", inset: 0, zIndex: (t) => t.zIndex.modal + 1 }}>
            <Paper
              role="dialog"
              aria-modal="true"
              elevation={3}
              sx={{
                p: 3,
                maxWidth: 560,
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
                  <Button variant="contained" onClick={handleRetryOutOfRange}>
                    Réessayer
                  </Button>
                  <Button variant="outlined" href="" onClick={(e) => e.preventDefault()}>
                    Voir la box sur la carte
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

