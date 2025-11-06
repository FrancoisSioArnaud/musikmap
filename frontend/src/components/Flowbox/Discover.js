
import React, { useEffect, useMemo, useRef, useState, useContext, useCallback } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import Drawer from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import Deposit from "../Common/Deposit";
import AchievementsPanel from "./AchievementsPanel";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { getValid, setWithTTL, removeKey } from "../../utils/mmStorage";

const KEY_MAIN = "mm_main_snapshot";       // { boxSlug, timestamp, mainDeposit: {...} }
const KEY_LAST = "mm_last_deposit";        // { boxSlug, timestamp, successes, song, points_balance, option }
const KEY_OLDER = "mm_older_snapshot";     // { boxSlug, timestamp, deposits: [ ... ] }
const TTL_MINUTES = 20;

// -------- util -----------
function ensurePlatformId(option) {
  if (!option) return option;
  if (typeof option.platform_id === "number") return option;
  // heuristique très simple : regarde l'URL
  const url = option.url || option.spotify_url || option.deezer_url || "";
  const isSpotify = /open\.spotify\.com|spotify:|spotify\.link/.test(url) || (option.platform === "spotify");
  const isDeezer = /deezer\.com/.test(url) || (option.platform === "deezer");
  return { ...option, platform_id: isSpotify ? 1 : (isDeezer ? 2 : 1) };
}

export default function Discover() {
  const navigate = useNavigate();
  const location = useLocation();
  const { boxSlug } = useParams();
  const { user, setUser } = useContext(UserContext) || {};
  const [searchParams, setSearchParams] = useSearchParams();

  // drawer state (piloté par query)
  const shouldOpenAchievements = searchParams.get("drawer") === "achievements";
  const mode = searchParams.get("mode"); // "deposit"

  // anti double POST (StrictMode)
  const didPostRef = useRef(false);

  // État local reconstruit depuis localStorage
  const [mainDep, setMainDep] = useState(null);
  const [myDepositSong, setMyDepositSong] = useState(null);   // uniquement la partie song affichée
  const [olderDeposits, setOlderDeposits] = useState([]);

  // succès affichés dans le drawer
  const [successes, setSuccesses] = useState([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);

  // -------- redirections utilitaires ----------
  const redirectOnboardingExpired = useCallback(() => {
    navigate(`/flowbox/${encodeURIComponent(boxSlug)}`, {
      replace: true,
      state: { error: "Accès à la boîte expiré" },
    });
  }, [navigate, boxSlug]);

  const redirectBackToMain = useCallback(() => {
    navigate(`/flowbox/${encodeURIComponent(boxSlug)}/Main`, { replace: true });
  }, [navigate, boxSlug]);

  // --------- reconstruct depuis localStorage -----------
  useEffect(() => {
    const snapMain = getValid(KEY_MAIN);
    const snapLast = getValid(KEY_LAST);
    const snapOlder = getValid(KEY_OLDER);

    // MainDeposit obligatoire pour affichage Discover "full-cookie"
    if (!snapMain || snapMain.boxSlug !== boxSlug || !snapMain.mainDeposit) {
      // Pas de snapshot valide => accès expiré
      redirectOnboardingExpired();
      return;
    }
    setMainDep(snapMain.mainDeposit);

    // MyDeposit + successes si présents (suite à un POST récent)
    if (snapLast && snapLast.boxSlug === boxSlug) {
      if (Array.isArray(snapLast.successes)) setSuccesses(snapLast.successes);
      if (snapLast.song) setMyDepositSong(snapLast.song);
    }

    // Older deposits snapshot (si présent)
    if (snapOlder && snapOlder.boxSlug === boxSlug && Array.isArray(snapOlder.deposits)) {
      setOlderDeposits(snapOlder.deposits);
    }
  }, [boxSlug, redirectOnboardingExpired]);

  // --------- POST (option B) déclenché au montage si demandé par query + location.state -----------
  useEffect(() => {
    // on post seulement si:
    // - drawer=achievements & mode=deposit
    // - ET on a un payload depuis location.state
    const action = location.state?.action;
    const payload = location.state?.payload;
    if (!shouldOpenAchievements || mode !== "deposit") return;
    if (action !== "createDeposit" || !payload?.option || !payload?.boxSlug) return;
    if (didPostRef.current) return;
    didPostRef.current = true;

    const run = async () => {
      try {
        setPosting(true);
        setPostError(null);

        const option = ensurePlatformId(payload.option);
        const body = { option, boxSlug: payload.boxSlug };
        const csrftoken = getCookie("csrftoken");

        const res = await fetch(`/box-management/get-box/?slug=${encodeURIComponent(payload.boxSlug)}`, {
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
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `HTTP ${res.status}`);
        }

        const data = await res.json().catch(() => null) || {};
        const { successes: sx = [], points_balance = null, song = null, deposits: olderMaybe = null } = data;

        // MAJ points
        if (typeof points_balance === "number" && setUser) {
          setUser((prev) => ({ ...(prev || {}), points: points_balance }));
        } else {
          // anonyme: stocke dans localStorage pour info cumul
          const total =
            (sx || []).find((s) => (s.name || "").toLowerCase() === "total")?.points ||
            (sx || []).find((s) => (s.name || "").toLowerCase() === "points_total")?.points ||
            0;
          const key = "anon_points";
          const cur = parseInt(localStorage.getItem(key) || "0", 10);
          localStorage.setItem(key, String(cur + total));
        }

        // Store mm_last_deposit (20 min) — on garde aussi l'option pour reconst. myDeposit si besoin
        const lastPayload = {
          boxSlug: payload.boxSlug,
          timestamp: Date.now(),
          successes: Array.isArray(sx) ? sx : [],
          song: song || option || null,      // si le back renvoie "song", priorité à lui; sinon fallback: option
          points_balance: points_balance ?? null,
          option,                             // pour info/diagnostic
        };
        setWithTTL(KEY_LAST, lastPayload, TTL_MINUTES);
        setSuccesses(lastPayload.successes);
        setMyDepositSong(lastPayload.song);

        // Snapshot des older si présents dans la réponse
        if (Array.isArray(olderMaybe)) {
          const olderSnap = { boxSlug: payload.boxSlug, timestamp: Date.now(), deposits: olderMaybe };
          setWithTTL(KEY_OLDER, olderSnap, TTL_MINUTES);
          setOlderDeposits(olderMaybe);
        }
      } catch (e) {
        setPostError(e?.message || "Échec de création du dépôt");
      } finally {
        setPosting(false);
      }
    };

    run();
  }, [shouldOpenAchievements, mode, location.state, setUser]);

  // --------- drawer handlers ----------
  const handleCloseDrawer = (event, reason) => {
    // Bloque backdrop & ESC
    if (reason === "backdropClick" || reason === "escapeKeyDown") return;

    // On retire drawer & mode des query params
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  const onAchievementsOk = () => {
    // même action que close, sans autoriser backdrop/esc
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  // --------- rendu ----------
  return (
    <Box sx={{ px: 2, pt: 3, pb: 10 }}>
      <Box className="intro" sx={{ mb: 2 }}>
        <Typography component="h1" variant="h1">Découvertes</Typography>
        <Typography component="h2" variant="body1">
          La boîte et tes derniers dépôts
        </Typography>
      </Box>

      {/* 1) MainDeposit (depuis mm_main_snapshot) */}
      {mainDep ? (
        <Box sx={{ mb: 2 }}>
          <Deposit
            dep={mainDep}
            user={user}
            variant="main"
            showReact={true}
            showPlay={true}
            showUser={true}
          />
        </Box>
      ) : null}

      {/* 2) MyDeposit (song only) */}
      {myDepositSong ? (
        <Box sx={{ mb: 2 }}>
          <Deposit
            dep={{ song: {
              title: myDepositSong.title,
              artist: myDepositSong.artist,
              spotify_url: myDepositSong.spotify_url || myDepositSong.url || null,
              deezer_url: myDepositSong.deezer_url || null,
              img_url: myDepositSong.img_url || myDepositSong.image_url || null,
            }}}
            user={user}
            variant="list"        // composant Deposit "song only"
            showReact={false}
            showPlay={true}
            showUser={false}
          />
        </Box>
      ) : null}

      {/* 3) OlderDeposits (snapshot si dispo) */}
      {Array.isArray(olderDeposits) && olderDeposits.length > 0 ? (
        <Box sx={{ mb: 4 }}>
          {olderDeposits.map((d, idx) => (
            <Box key={d?.id ?? idx} sx={{ mb: 1.5 }}>
              <Deposit
                dep={d}
                user={user}
                variant="list"
                showReact={false}
                showPlay={true}
                showUser={true}
              />
            </Box>
          ))}
        </Box>
      ) : null}

      {/* Drawer Achievements (ouvert via query) */}
      <Drawer
        anchor="right"
        open={shouldOpenAchievements}
        onClose={handleCloseDrawer}
        ModalProps={{ disableEscapeKeyDown: true }}
        PaperProps={{
          sx: { width: "100vw", maxWidth: 560, height: "100dvh", display: "flex", flexDirection: "column" },
        }}
      >
        {/* HEADER */}
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
          {/* on ne permet PAS la fermeture par le X si tu veux forcer le parcours -> je laisse, mais on peut l'enlever */}
          <IconButton aria-label="Fermer" onClick={(e) => handleCloseDrawer(e, "closeButton")}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* CONTENU */}
        <Box component="main" sx={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}>
          <Box sx={{ boxSizing: "border-box", minHeight: "100%", p: 2 }}>
            {posting && !postError ? (
              <Box sx={{ display: "grid", placeItems: "center", height: "60vh" }}>
                <CircularProgress />
              </Box>
            ) : postError ? (
              <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography color="error" sx={{ mb: 2 }}>
                  {postError}
                </Typography>
                <Typography variant="body2" sx={{ mb: 3 }}>
                  Une erreur est survenue pendant le dépôt.
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "center" }}>
                  <button
                    className="MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-fullWidth"
                    onClick={redirectBackToMain}
                    style={{ padding: "8px 16px", borderRadius: 8 }}
                  >
                    Retour à la boîte
                  </button>
                </Box>
              </Box>
            ) : (
              <AchievementsPanel successes={Array.isArray(successes) ? successes : []} onPrimaryCta={onAchievementsOk} />
            )}
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
