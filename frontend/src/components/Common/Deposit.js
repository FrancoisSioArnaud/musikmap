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
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";

import PlayModal from "../Common/PlayModal";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

/**
 * Composant Deposit (toujours **pleine largeur**)
 *
 * Variants:
 * - "list" : états To_Reveal & Reveal, CTA overlay, Snackbar, PlayModal
 * - "main" : rendu plein-format (premier dépôt), pas de CTA overlay, pas de Snackbar
 *
 * Props:
 * - dep: { deposit_id, deposit_date, user:{ username, profile_pic_url }, song:{ title?, artist?, img_url, ... } }
 * - user: utilisateur courant
 * - setDispDeposits: setter parent (utile pour "list")
 * - cost: nombre (crédits) — défaut 40
 * - variant: "list" | "main" — défaut "list"
 * - showDate, showUser: booleans (défaut true)
 * - fitContainer: ignoré (toujours full width)
 */
export default function Deposit({
  dep,
  user,
  setDispDeposits,
  cost = 40,
  variant = "list",
  showDate = true,
  showUser = true,
  fitContainer = true, // accepté mais ignoré
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

  // =========================
  // RENDUS PAR VARIANTES
  // =========================

  // ---- VARIANT: MAIN (plein format, pas de snackbar, pas de CTA overlay) ----
  if (variant === "main") {
    return (
      <>
        <Card className="deposit">
          {showDate && (
            <Box className="deposit_date">
              
              <Box className="icon squaredesign" >
              </Box>
              <Typography className="squaredesign" variant="subtitle1" component="span">
                {"Déposée " + (dep?.deposit_date || "")}
              </Typography>
            </Box>
          )}

        {showUser && (
          <Box
            onClick={() => { if (u?.username) navigate("/profile/" + u.username); }}
            className={u?.username ? "hasUsername deposit_user" : "deposit_user"} 
          >
            <Box className="squaredesign avatarbox">
              <Avatar
                src={u?.profile_pic_url || undefined}
                alt={u?.username || "Anonyme"}
                className="avatar"
              />
            </Box>
            <Typography component="span" className="username squaredesign" variant="subtitle1"> 
              {u?.username || "Anonyme"}
              {u?.username && (
                <ArrowForwardIosIcon className="icon" />
              )}
            </Typography>
            
          </Box>
        )}

          {/* song (cover pleine largeur, titres si révélé) */}
          <Box className="deposit_song">
            <Box sx={{ width: "100%", maxWidth: "100%", overflow: "hidden" }} className="squaredesign img_container">
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
                  }}
                />
              )}
            </Box>
            <Box className="interact">
              <Box className="texts">
                {isRevealed && (
                  <>
                    <Typography component="span" className="titre squaredesign" variant="h3">
                      {s.title}
                    </Typography>
                    <Typography component="span" className="artist squaredesign" variant="body1">
                      {s.artist}
                    </Typography>
                  </>
                )}
              </Box>
              <Button
                variant="depositInteract"
                className="play playMain"
                size="large"
                onClick={() => (isRevealed ? openPlayFor(s) : null)}
                disabled={!isRevealed}
                startIcon={<PlayArrowIcon />}
                
              >
                Play
              </Button>
            </Box>
          </Box>
        </Card>

        {/* PlayModal (toujours local) */}
        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
      </>
    );
  }

  // ---- VARIANT: LIST (To_Reveal / Reveal, overlay CTA, snackbar) ----
  return (
    <>
      <Card>
        {showDate && (
          <Box className="deposit_date">
            <Typography component="h3" variant="subtitle1">
              {"Déposée " + (dep?.deposit_date || "")}
            </Typography>
          </Box>
        )}

        {showUser && (
          <Box
            className="deposit_user"
            sx={{
              display: "flex",
              minWidth: 0,
            }}
            onClick={() => { if (u?.username) navigate("/profile/" + u.username); }}
          >
            <Avatar
              src={u?.profile_pic_url || undefined}
              alt={u?.username || "Anonyme"}
            />
            <Typography>
              {u?.username || "Anonyme"}
            </Typography>
            {u?.username && (
              <ArrowForwardIosIcon fontSize="small" />
            )}
          </Box>
        )}

        {/* zone chanson (grille + overlay éventuel) */}
        <Box
          className="deposit_song"
          sx={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            minWidth: 0,
          }}
        >
          {/* cover */}
          <Box sx={{ width: 160, height: 160}} className="squaredesign img_container">
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
                  filter: isRevealed ? "none" : "blur(6px)",
                }}
              />
            )}
          </Box>

          {/* textes + Play (ou Skeleton si non révélé) */}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            {isRevealed ? (
              <>
                <Typography component="h2" variant="h4">
                  {s.title}
                </Typography>
                <Typography component="h3" variant="body">
                  {s.artist}
                </Typography>
                <Button
                  variant="depositInteract"
                  className="play playSecondary"
                  size="large"
                  onClick={() => openPlayFor(s)}
                  startIcon={<PlayArrowIcon />}
                >
                  Play
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="depositInteract"
                  onClick={revealDeposit}
                  disabled={!user || !user.username}
                  className="decouvrir"
                >
                  <Typography className="points" variant="h4">
                    {cost}
                  </Typography>
                  Découvrir
                </Button>
              </>
            )}
          </Box>
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
