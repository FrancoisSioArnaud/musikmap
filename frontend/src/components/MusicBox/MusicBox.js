// frontend/src/components/MusicBox/MusicBox.js
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
const SongDisplay = lazy(() => import("./OnBoarding/SongDisplay"));

/* =======================
   Helpers API (léger)
======================= */
async function fetchBoxMeta(boxName, navigate) {
  try {
    const res = await fetch(
      `/box-management/meta?name=${encodeURIComponent(boxName)}`,
      {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }
    );
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
  const res = await fetch(
    `/box-management/get-box?name=${encodeURIComponent(boxName)}`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    }
  );
  if (!res.ok) throw new Error(`GetBox HTTP ${res.status}`);
  return await res.json(); // { box, deposit_count, deposits, reveal_cost }
}

/* =======================
   Géoloc util
======================= */
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

  /* =======================
     0) Récup meta (hero)
  ======================= */
  useEffect(() => {
    let mounted = true;
    setMetaLoading(true);
    fetchBoxMeta(boxName, navigate).then((m) => {
      if (!mounted) return;
      setMeta({
        box: m?.box || {},
        deposit_count: Number(m?.deposit_count || 0),
      });
      setMetaLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [boxName, navigate]);

  /* =========================================================
     (SUPPRIMÉ) — AUCUN pré-chargement silencieux de la box.
     On ne charge le contenu réel que quand l’utilisateur
     ouvre la section ET que la géoloc+in-range sont validés.
  ========================================================= */

  /* ================================================
     1) Click "Ouvrir la boîte" → ouvrir la section
  ================================================ */
  const openSection = useCallback(() => {
    setSectionOpen(true);
    // scroll jusqu’à l’ancre
    const anchor = document.getElementById("songdisplay-anchor");
    if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });

    // On interroge la permission via Permissions API (si dispo)
    (async () => {
      try {
        if (!("permissions" in navigator) || !navigator.permissions.query) {
          setPermissionState("unknown");
          return;
        }
        const st = await navigator.permissions.query({ name: "geolocation" });
        setPermissionState(st.state); // 'granted' | 'prompt' | 'denied'
        try {
          st.onchange = () => setPermissionState(st.state);
        } catch {}
      } catch {
        setPermissionState("unknown");
      }
    })();
  }, []);

  /* ======================================================================
     2) À l’ouverture de la section : on ne fait RIEN tant que la permission
        n’est pas 'granted'. Dès que 'granted', on check in-range puis on
        fetch la box et on l’affiche dès réception.
  ====================================================================== */
  useEffect(() => {
    let cancelled = false;

    async function resolveSectionData() {
      if (!sectionOpen) return;
      if (permissionState !== "granted") return;

      // Permission accordée → vérifier in-range
      setGeoError("");
      const pos = await getPositionOnce().catch((e) => {
        if (!cancelled)
          setGeoError(e?.message || "Impossible d’obtenir ta position.");
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

      // === CHARGER LA BOX ET AFFICHER DIRECT DÈS QUE ÇA RÉPOND ===
      setGetBoxLoading(true);
      try {
        const data = await fetchGetBox(boxName);
        if (!cancelled) setBoxData(data); // -> rend SongDisplay tout de suite
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
  }, [sectionOpen, permissionState, meta.box, boxName]);

  /* =================================================================================
     3) Re-check périodique (toutes les 5s) si section ouverte, permission accordée,
        et onglet visible. Si on (re)entre in-range et qu’on n’a pas de data, on fetch.
        Si on sort de la zone, on masque (overlay) mais on garde les data en mémoire.
  ================================================================================= */
  useEffect(() => {
    function isActive() {
      return (
        sectionOpen &&
        permissionState === "granted" &&
        document.visibilityState === "visible"
      );
    }

    async function tick() {
      try {
        if (!isActive()) return;
        const pos = await getPositionOnce().catch(() => null);
        if (!pos) return;

        const r = await postLocation(meta.box, pos.coords);
        const valid = !!(r.ok && r.data?.valid);

        if (valid) {
          if (!inRange) {
            // On vient d’entrer dans la zone
            setInRange(true);
            if (!boxData) {
              // Pas encore de données → on charge et on affiche dès retour
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
          } else {
            // Déjà in-range, on reste comme tel
            setInRange(true);
          }
        } else {
          // Hors range → overlay + Skeletons; on garde les données en mémoire
          setInRange(false);
        }
      } catch {
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

  /* =======================
     UI dérivés
  ======================= */
  const depositCount = useMemo(() => Number(meta?.deposit_count || 0), [meta]);
  const boxTitle = useMemo(() => meta?.box?.name || "", [meta]);

  // Overlays conditionnels
  const showEnableLocationOverlay = sectionOpen && permissionState !== "granted";
  const showOutOfRangeOverlay =
    sectionOpen && permissionState === "granted" && !inRange;

  // Handlers overlay
  const handleRequestLocation = async () => {
    setGeoError("");
    try {
      const pos = await getPositionOnce();
      setPermissionState("granted");
      const r = await postLocation(meta.box, pos.coords);
      const valid = !!(r.ok && r.data?.valid);
      setInRange(valid);

      if (valid) {
        setGetBoxLoading(true);
        try {
          const data = await fetchGetBox(boxName);
          setBoxData(data); // -> affiche direct
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
          setBoxData(data); // -> affiche direct
        } finally {
          setGetBoxLoading(false);
        }
      }
    } catch (e) {
      setGeoError(e?.message || "Erreur géolocalisation.");
    }
  };

  return (
    <Box sx={{ display: "grid", gap: 0, pb: 0 }}>
      {/* ================= HERO plein écran (100vh) ================= */}
      <Paper
        elevation={3}
        sx={{
          minHeight: "100vh",          // plein écran
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          px: { xs: 2, md: 4 },
        }}
      >
        <Box
          sx={{
            display: "grid",
            gap: 2,
            maxWidth: 960,
            width: "100%",
            textAlign: "center",
          }}
        >
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
          <Box sx={{ mt: 1 }}>
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
            <Typography
              id="open-box-desc"
              variant="caption"
              sx={{ display: "block", mt: 1, opacity: 0.7 }}
            >
              Fait défiler jusqu’au contenu
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* ================= ANCRE SECTION ================= */}
      <span id="songdisplay-anchor" />

      {/* ================= SECTION SONGDISPLAY (skeletons ou contenu) ================= */}
      <Box sx={{ position: "relative", minHeight: 400 }}>
        {/* Skeletons :
            - section ouverte MAIS pas de données (GetBox pas encore chargé),
            - ou permission non accordée,
            - ou hors range,
            - ou en cours de fetch. */}
        {sectionOpen &&
          (!boxData ||
            getBoxLoading ||
            !inRange ||
            permissionState !== "granted") && (
            <Box sx={{ display: "grid", gap: 2, p: 2 }}>
              <Skeleton variant="rounded" height={120} />
              <Skeleton variant="rounded" height={320} />
              <Skeleton variant="rounded" height={220} />
            </Box>
          )}

        {/* Contenu réel (SongDisplay) uniquement si :
            - section ouverte,
            - permission accordée,
            - in-range,
            - boxData prêt. */}
        {sectionOpen && permissionState === "granted" && inRange && boxData && (
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
                  const nextArr =
                    typeof updater === "function" ? updater(prevArr) : updater;
                  return { ...(prev || {}), deposits: nextArr };
                });
              }}
              isSpotifyAuthenticated={false}
              isDeezerAuthenticated={false}
              boxName={boxName}
              user={user}
              revealCost={
                typeof boxData?.reveal_cost === "number" ? boxData.reveal_cost : 40
              }
            />
          </Suspense>
        )}

        {/* Overlay: EnableLocation (permission non accordée) */}
        {sectionOpen && showEnableLocationOverlay && (
          <Backdrop
            open
            sx={{ position: "absolute", inset: 0, zIndex: (t) => t.zIndex.modal + 1 }}
          >
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
                  Confirme que tu es bien à côté du spot en partageant ta localisation.
                  Elle est utilisée uniquement pour ouvrir la boîte.
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

        {/* Overlay: Hors range */}
        {sectionOpen && showOutOfRangeOverlay && (
          <Backdrop
            open
            sx={{ position: "absolute", inset: 0, zIndex: (t) => t.zIndex.modal + 1 }}
          >
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
                  <Button
                    variant="outlined"
                    href=""
                    onClick={(e) => e.preventDefault()}
                  >
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
