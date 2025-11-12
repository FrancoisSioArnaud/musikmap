// frontend/src/components/Flowbox/Discover.js

import React, { useEffect, useRef, useState, useContext, useCallback } from "react";
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
import { getValid, setWithTTL } from "../Utils/mmStorage";

const KEY_BOX_CONTENT = "mm_box_content"; // clé unique
const TTL_MINUTES = 20;

// Anciennes clés (pour migration douce)
const LEGACY_KEY_MAIN = "mm_main_snapshot";   // { boxSlug, timestamp, mainDeposit: {...} }
const LEGACY_KEY_LAST = "mm_last_deposit";    // { boxSlug, timestamp, successes, song|myDepositSong, points_balance, option }
const LEGACY_KEY_OLDER = "mm_older_snapshot"; // { boxSlug, timestamp, deposits: [ ... ] }

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

  // État local : objet unique "boxContent"
  const [boxContent, setBoxContent] = useState(null);

  // On garde aussi un état local pour l'affichage instantané des succès pendant le POST
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

  // -------- helpers --------
  const normalizeOptionToSong = (option) => {
    if (!option) return null;
    // option vient du LiveSearch: { name, artist, image_url, platform_id? ... }
    return {
      title: option.name || null,
      artist: option.artist || null,
      image_url: option.image_url || null,
    };
  };

  const saveBoxContent = (content) => {
    const payload = {
      ...content,
      boxSlug,
      timestamp: Date.now(),
    };
    setWithTTL(KEY_BOX_CONTENT, payload, TTL_MINUTES);
    setBoxContent(payload);
    setSuccesses(Array.isArray(payload.successes) ? payload.successes : []);
  };

  const migrateLegacyIfNeeded = () => {
    // Tente de reconstituer mm_box_content depuis les anciennes clés s'il n'existe pas
    const snap = getValid(KEY_BOX_CONTENT);
    if (snap && snap.boxSlug === boxSlug && snap.main) {
      return snap;
    }

    const legacyMain = getValid(LEGACY_KEY_MAIN);
    const legacyLast = getValid(LEGACY_KEY_LAST);
    const legacyOlder = getValid(LEGACY_KEY_OLDER);

    if (!legacyMain && !legacyLast && !legacyOlder) return null;

    // Repack
    const repacked = {
      boxSlug: legacyMain?.boxSlug || legacyLast?.boxSlug || boxSlug,
      timestamp: Date.now(),
      main: legacyMain?.mainDeposit || null,
      myDeposit: legacyLast
        ? {
            song:
              legacyLast.song ||
              legacyLast.myDepositSong ||
              (legacyLast.option ? normalizeOptionToSong(legacyLast.option) : null),
          }
        : null,
      successes: Array.isArray(legacyLast?.successes) ? legacyLast.successes : [],
      older: Array.isArray(legacyOlder?.deposits) ? legacyOlder.deposits : [],
    };

    // Sauvegarde unifiée
    saveBoxContent(repacked);
    return repacked;
  };

  // --------- reconstruct depuis localStorage -----------
  useEffect(() => {
    const snap = getValid(KEY_BOX_CONTENT);
    if (snap && snap.boxSlug === boxSlug && snap.main) {
      setBoxContent(snap);
      setSuccesses(Array.isArray(snap.successes) ? snap.successes : []);
      return;
    }

    // sinon, migration depuis legacy si possible
    const migrated = migrateLegacyIfNeeded();
    if (migrated && migrated.main && migrated.boxSlug === boxSlug) {
      setBoxContent(migrated);
      setSuccesses(Array.isArray(migrated.successes) ? migrated.successes : []);
      return;
    }

    // Rien d'utilisable => accès expiré
    redirectOnboardingExpired();
  }, [boxSlug, redirectOnboardingExpired]);

  // --------- POST (création dépôt) si drawer=achievements&mode=deposit -----------
  useEffect(() => {
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

        const option = payload.option;
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

        const data = (await res.json().catch(() => null)) || {};
        const {
          successes: sx = [],
          points_balance = null,
          song = null,              // (facultatif côté API) – pas indispensable si on a déjà option
          deposits: olderMaybe = null,
          main: mainMaybe = null,   // (si un jour l'API renvoie le main directement)
        } = data;

        // MAJ points
        if (typeof points_balance === "number" && setUser) {
          setUser((prev) => ({ ...(prev || {}), points: points_balance }));
        } else if (Array.isArray(sx)) {
          // anonyme: stocke total de points localement (indicatif)
          const total =
            sx.find((s) => (s.name || "").toLowerCase() === "total")?.points ??
            sx.find((s) => (s.name || "").toLowerCase() === "points_total")?.points ??
            0;
          const key = "anon_points";
          const cur = parseInt(localStorage.getItem(key) || "0", 10);
          localStorage.setItem(key, String(cur + (Number(total) || 0)));
        }

        // Normalise la chanson déposée pour le format cible
        const normalizedSong = song
          ? {
              title: song.title ?? option.name ?? null,
              artist: song.artist ?? option.artist ?? null,
              image_url: song.image_url ?? option.image_url ?? null,
            }
          : normalizeOptionToSong(option);

        // Base actuelle (si existante) pour préserver "main" et "older" lors de l’update
        const prev = getValid(KEY_BOX_CONTENT);
        const nextContent = {
          boxSlug: payload.boxSlug,
          timestamp: Date.now(),
          main: mainMaybe || prev?.main || boxContent?.main || null,
          myDeposit: { song: normalizedSong },
          successes: Array.isArray(sx) ? sx : [],
          older: Array.isArray(olderMaybe)
            ? olderMaybe
            : Array.isArray(prev?.older)
            ? prev.older
            : Array.isArray(boxContent?.older)
            ? boxContent.older
            : [],
        };

        saveBoxContent(nextContent);
      } catch (e) {
        setPostError(e?.message || "Échec de création du dépôt");
      } finally {
        setPosting(false);
      }
    };

    run();
  }, [shouldOpenAchievements, mode, location.state, setUser, boxContent]);

  // --------- drawer handlers ----------
  const handleCloseDrawer = (event, reason) => {
    // Bloque backdrop & ESC
    if (reason === "backdropClick" || reason === "escapeKeyDown") return;

    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  const onAchievementsOk = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("drawer");
    next.delete("mode");
    setSearchParams(next, { replace: true });
  };

  // --------- rendu ----------
  const mainDep = boxContent?.main || null;
  const myDepositSong = boxContent?.myDeposit?.song || null;
  const olderDeposits = Array.isArray(boxContent?.older) ? boxContent.older : [];

  return (
    <Box sx={{ px: 2, pt: 3, pb: 10 }}>
      <Box className="intro" sx={{ mb: 2 }}>
        <Typography component="h1" variant="h1">Découvertes</Typography>
        <Typography component="h2" variant="body1">
          La boîte et tes derniers dépôts
        </Typography>
      </Box>

      {/* 1) MainDeposit */}
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
              title: myDepositSong.title || null,
              artist: myDepositSong.artist || null,
              image_url: myDepositSong.image_url || null,
            }}}
            user={user}
            variant="list"
            showReact={false}
            showPlay={false}
            showUser={false}
          />
        </Box>
      ) : null}

      {/* 3) OlderDeposits */}
      {olderDeposits.length > 0 ? (
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

      {/* Drawer Achievements */}
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
              <AchievementsPanel
                successes={Array.isArray(successes) ? successes : []}
                onPrimaryCta={onAchievementsOk}
              />
            )}
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
