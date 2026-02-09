
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
    // Unification : plus de 'older', uniquement 'olderDeposits'
    const payload = {
      ...content,
      boxSlug,
      timestamp: Date.now(),
    };
    setWithTTL(KEY_BOX_CONTENT, payload, TTL_MINUTES);
    setBoxContent(payload);
    setSuccesses(Array.isArray(payload.successes) ? payload.successes : []);
  };

  // --------- reconstruct depuis localStorage -----------
  useEffect(() => {
    const snap = getValid(KEY_BOX_CONTENT);
    if (snap && snap.boxSlug === boxSlug && snap.main) {
      setBoxContent(snap);
      setSuccesses(Array.isArray(snap.successes) ? snap.successes : []);
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

        const res = await fetch(
          `/box-management/get-box/?slug=${encodeURIComponent(payload.boxSlug)}`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "X-CSRFToken": csrftoken,
              Accept: "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `HTTP ${res.status}`);
        }

        const data = (await res.json().catch(() => null)) || {};
        const {
          successes: sx = [],
          points_balance = null,
          song = null, // (facultatif côté API)
          older_deposits: olderApi = null, // 🔥 nouvelle clé côté API
          main: mainMaybe = null, // (si un jour l'API renvoie le main directement)
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

        // On fixe la date de dépôt côté front pour myDeposit
        const isoNow = new Date().toISOString();

        // Base actuelle (si existante) pour préserver "main" et "olderDeposits" lors de l’update
        const prev = getValid(KEY_BOX_CONTENT);
        const nextContent = {
          boxSlug: payload.boxSlug,
          timestamp: Date.now(),
          main: mainMaybe || prev?.main || boxContent?.main || null,
          myDeposit: {
            song: normalizedSong,
            deposited_at: isoNow, // ⬅️ ajouté : date absolue du dépôt côté front
          },
          successes: Array.isArray(sx) ? sx : [],
          olderDeposits: Array.isArray(olderApi)
            ? olderApi
            : Array.isArray(prev?.olderDeposits)
            ? prev.olderDeposits
            : Array.isArray(boxContent?.olderDeposits)
            ? boxContent.olderDeposits
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
  }, [shouldOpenAchievements, mode, location.state, setUser, boxContent, boxSlug]);

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
  const myDeposit = boxContent?.myDeposit || null;
  const olderDeposits = Array.isArray(boxContent?.olderDeposits)
    ? boxContent.olderDeposits
    : [];

  return (
    <Box>
      <Box className="intro">
        <Typography component="h1" variant="h1">
          Bonne écoute !
        </Typography>
        <Typography component="h2" variant="body1">
          La chanson que tu as remplacée
        </Typography>
      </Box>

      {/* 1) MainDeposit */}
      {mainDep ? (
        <Box>
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

      <Typography component="h2" variant="h3" sx={{ mt: 5 }}>
        Ta chanson est déposée
      </Typography>
      <Typography component="h2" variant="body1" sx={{ mt: 5 }}>
        La chanson est maintenant dans la boîte.
        La prochaine personne pourra l’écouter.
      </Typography>
      {/* 2) MyDeposit (avec deposited_at côté front) */}
      {myDeposit ? (
        <Box>
          <Deposit
            dep={myDeposit}
            user={user}
            variant="list"
            showTime={false}
            showReact={false}
            showPlay={false}
            showUser={false}
          />
        </Box>
      ) : null}

      {/* 3) OlderDeposits */}
      {olderDeposits.length > 0 ? (
        <Box id="older_deposits">
          <Box className="intro" sx={{ p: 4 }}>
            <Typography component="h2" variant="h3" sx={{ mt: 5 }}>
              Découvre d’autres chansons
            </Typography>
            <Typography component="body" variant="body1">
              Ces chansons ont été déposées plus tôt dans cette boîte. Utilise tes points pour les révéler.
            </Typography>
          </Box>
          <Box id="older_deposits_list">
            {olderDeposits.map((d, idx) => (
              <Deposit
                key={d.public_key || idx}
                dep={d}
                user={user}
                variant="list"
                showReact={false}
                showPlay={true}
                showUser={true}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      {/* Drawer Achievements */}
      <Drawer
        anchor="right"
        open={shouldOpenAchievements}
        onClose={handleCloseDrawer}
        ModalProps={{ disableEscapeKeyDown: true }}
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
          <IconButton
            aria-label="Fermer"
            onClick={(e) => handleCloseDrawer(e, "closeButton")}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        {/* CONTENU */}
        <Box
          component="main"
          sx={{ flex: "1 1 auto", minHeight: 0, overflow: "auto" }}
        >
          <Box sx={{ boxSizing: "border-box", minHeight: "100%", p: 2 }}>
            {posting && !postError ? (
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  height: "60vh",
                }}
              >
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
