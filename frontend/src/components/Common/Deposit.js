import React, { useState, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Skeleton from "@mui/material/Skeleton";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Slide from "@mui/material/Slide";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";

import PlayModal from "../Common/PlayModal";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

/**
 * Composant Deposit
 *
 * Variants:
 * - "list" (par défaut) : états To_Reveal & Reveal, CTA overlay, Snackbar, PlayModal
 * - "main" : rendu plein-format (premier dépôt), pas de CTA overlay, pas de Snackbar
 *
 * Props:
 * - dep: { deposit_id, deposit_date, user:{ username, profile_pic_url }, song:{ title?, artist?, img_url, ... } }
 * - user: utilisateur courant (pour savoir si connecté)
 * - setDispDeposits: setter parent pour muter la liste après reveal (utile pour "list")
 * - cost: nombre (crédits) — défaut 40 (utile pour "list")
 * - variant: "list" | "main" — défaut "list"
 * - showDate: bool — affiche la ligne “Pépite déposée …” (défaut true)
 * - showUser: bool — affiche l’en-tête avatar + username (défaut true)
 * - fitContainer: bool — card en largeur 100% (pile), sinon largeur carrousel (défaut false)
 */
export default function Deposit({
  dep,
  user,
  setDispDeposits,
  cost = 40,
  variant = "list",
  showDate = true,
  showUser = true,
  fitContainer = false,
}) {
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext) || {};

  const s = dep?.song || {};
  const u = dep?.user || {};
  const isRevealed = useMemo(() => Boolean(s?.title && s?.artist), [s?.title, s?.artist]);

  // PlayModal (local au composant)
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

  // Snackbar (uniquement pour variant "list")
  const [snackOpen, setSnackOpen] = useState(false);
  const showRevealSnackbar = () => {
    if (snackOpen) {
      setSnackOpen(false);
      setTimeout(() => setSnackOpen(true), 0);
    } else {
      setSnackOpen(true);
    }
  };

  // ---- Reveal d’un dépôt (uniquement pertinent pour "list") ----
  const revealDeposit = async () => {
    try {
      if (!user || !user.username) {
        alert("Connecte-toi pour révéler cette pépite.");
        return;
      }
      const csrftoken = getCookie("csrftoken");
      const res = await fetch("/box-management/revealSong", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
        body: JSON.stringify({ deposit_id: dep.deposit_id }),
        credentials: "same-origin",
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload?.error === "insufficient_funds") {
          alert("Tu n’as pas assez de crédit pour révéler cette pépite");
        } else {
          alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
        }
        return;
      }

      // MAJ visuelle dans la liste parent
      const revealed = payload?.song || {};
      setDispDeposits?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => x?.deposit_id === dep.deposit_id);
        if (idx >= 0) {
          arr[idx] = {
            ...arr[idx],
            discovered_at: "à l'instant",
            song: {
              ...(arr[idx]?.song || {}),
              title: revealed.title,
              artist: revealed.artist,
              spotify_url: revealed.spotify_url,
              deezer_url: revealed.deezer_url,
            },
          };
        }
        return arr;
      });

      // MAJ points (menu / UserContext)
      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((p) => ({ ...(p || {}), points: payload.points_balance }));
      }

      showRevealSnackbar();
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    }
  };

  // Styles largeur card (pile vs carrousel)
  const cardWidthStyles = fitContainer
    ? { width: "100%", maxWidth: "100%" }
    : { width: "calc(80vw - 32px)", maxWidth: 720, flex: "0 0 auto" };

  // =========================
  // RENDUS PAR VARIANTES
  // =========================

  // ---- VARIANT: MAIN (plein format, pas de snackbar, pas de CTA overlay) ----
  if (variant === "main") {
    return (
      <>
        <Card
          sx={{
            p: 2,
            ...cardWidthStyles,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {/* date dépôt */}
          {showDate && (
            <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {"Pépite déposée " + (dep?.deposit_date || "") + "."}
            </Box>
          )}

          {/* user */}
          {showUser && (
            <Box
              id="deposit_user"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                cursor: u?.username ? "pointer" : "default",
                minWidth: 0,
              }}
              onClick={() => { if (u?.username) navigate("/profile/" + u.username); }}
            >
              <Avatar
                src={u?.profile_pic_url || undefined}
                alt={u?.username || "Anonyme"}
                sx={{ width: 40, height: 40, flex: "0 0 auto" }}
              />
              <Typography sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u?.username || "Anonyme"}
              </Typography>
            </Box>
          )}

          {/* song (cover pleine largeur, titres si révélé) */}
          <Box id="deposit_song" sx={{ display: "grid", gap: 1, mb: 2, minWidth: 0 }}>
            <Box sx={{ width: "100%", maxWidth: "100%", borderRadius: 1, overflow: "hidden" }}>
              {s?.img_url && (
                <Box
                  component="img"
                  src={s.img_url}
                  alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                  sx={{
                    width: "100%",
                    maxWidth: "100%",
                    aspectRatio: "1 / 1",
                    objectFit: "cover",
                    display: "block",
                    filter: isRevealed ? "none" : "blur(6px) brightness(0.9)",
                  }}
                />
              )}
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 2,
                minWidth: 0,
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                {isRevealed && (
                  <>
                    <Typography component="h1" variant="h5" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
                      {s.title}
                    </Typography>
                    <Typography component="h2" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
                      {s.artist}
                    </Typography>
                  </>
                )}
              </Box>
              <Button
                variant="contained"
                size="large"
                onClick={() => (isRevealed ? openPlayFor(s) : null)}
                disabled={!isRevealed}
              >
                Play
              </Button>
            </Box>
          </Box>
        </Card>

        {/* PlayModal (local) */}
        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
      </>
    );
  }

  // ---- VARIANT: LIST (To_Reveal / Reveal, overlay CTA, snackbar) ----
  return (
    <>
      <Card
        sx={{
          p: 2,
          ...cardWidthStyles,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* date dépôt */}
        {showDate && (
          <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
            {"Pépite déposée " + (dep?.deposit_date || "") + "."}
          </Box>
        )}

        {/* user */}
        {showUser && (
          <Box
            id="deposit_user"
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 2,
              cursor: u?.username ? "pointer" : "default",
              minWidth: 0,
            }}
            onClick={() => { if (u?.username) navigate("/profile/" + u.username); }}
          >
            <Avatar
              src={u?.profile_pic_url || undefined}
              alt={u?.username || "Anonyme"}
              sx={{ width: 40, height: 40, flex: "0 0 auto" }}
            />
            <Typography sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u?.username || "Anonyme"}
            </Typography>
          </Box>
        )}

        {/* zone chanson (grille + overlay éventuel) */}
        <Box
          id="deposit_song"
          sx={{
            position: "relative", // overlay
            display: "grid",
            gridTemplateColumns: "140px 1fr",
            gap: 2,
            mb: 2,
            alignItems: "center",
            minWidth: 0,
          }}
        >
          {/* cover */}
          <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden", flex: "0 0 auto" }}>
            {s?.img_url && (
              <Box
                component="img"
                src={s.img_url}
                alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                sx={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  filter: isRevealed ? "none" : "blur(6px) brightness(0.9)",
                }}
              />
            )}
          </Box>

          {/* textes + Play (ou Skeleton si non révélé) */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            {isRevealed ? (
              <>
                <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
                  {s.title}
                </Typography>
                <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
                  {s.artist}
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  onClick={() => openPlayFor(s)}
                  sx={{ alignSelf: "flex-start", mt: 0.5 }}
                >
                  Play
                </Button>
              </>
            ) : (
              <>
                <Skeleton variant="text" width="80%" height={28} />
                <Skeleton variant="text" width="50%" height={24} />
                <Skeleton variant="rectangular" width={120} height={36} sx={{ borderRadius: 1, mt: 0.5 }} />
              </>
            )}
          </Box>

          {/* Overlay CTA Découvrir — seulement si non révélé */}
          {!isRevealed && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 100%)",
                borderRadius: 1,
                px: 2,
              }}
            >
              <Button
                variant="contained"
                size="large"
                onClick={revealDeposit}
                disabled={!user || !user.username}
                sx={{ fontWeight: 700, backdropFilter: "blur(2px)" }}
              >
                {`Découvrir — ${cost}`}
              </Button>
            </Box>
          )}
        </Box>
      </Card>

      {/* PLAY MODAL (local au Deposit) */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

      {/* SNACKBAR (local au Deposit – seulement en "list") */}
      <Snackbar
        open={snackOpen}
        onClose={() => setSnackOpen(false)}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        TransitionComponent={SlideDownTransition}
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
      >
        <SnackbarContent
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
            borderRadius: 2,
            boxShadow: 3,
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            maxWidth: 600,
            width: "calc(100vw - 32px)",
          }}
          message={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <LibraryMusicIcon fontSize="medium" />
              <Typography variant="body2" sx={{ whiteSpace: "normal" }}>
                Retrouve cette chanson dans ton profil
              </Typography>
            </Box>
          }
          action={
            <Button
              size="small"
              onClick={() => {
                setSnackOpen(false);
                navigate("/profile");
              }}
              aria-label="Voir la chanson dans mon profil"
            >
              Voir
            </Button>
          }
        />
      </Snackbar>
    </>
  );
}
