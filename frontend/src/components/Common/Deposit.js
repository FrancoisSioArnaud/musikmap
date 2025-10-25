import React, { useState, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Slide from "@mui/material/Slide";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import AlbumIcon from "@mui/icons-material/Album";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";

import PlayModal from "../Common/PlayModal";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import ReactionModal from "./ReactionModal";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

export default function Deposit({
  dep,
  user,
  setDispDeposits,
  cost = 40,
  variant = "list",
  showDate = true,
  showUser = true,
  fitContainer = true,
}) {
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext) || {};

  const s = dep?.song || {};
  const u = dep?.user || {};
  const isRevealed = useMemo(() => Boolean(s?.title && s?.artist), [s?.title, s?.artist]);

  // ======= Play modal =======
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const openPlayFor = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };
  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  // ======= Reaction modal =======
  const [reactOpen, setReactOpen] = useState(false);
  const openReact = () => setReactOpen(true);
  const closeReact = () => setReactOpen(false);

  // Snackbar (pour Reveal existant)
  const [snackOpen, setSnackOpen] = useState(false);
  const showRevealSnackbar = () => {
    if (snackOpen) {
      setSnackOpen(false);
      setTimeout(() => setSnackOpen(true), 0);
    } else setSnackOpen(true);
  };

  // ---- Reveal d’un dépôt (identique)
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

      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((p) => ({ ...(p || {}), points: payload.points_balance }));
      }

      showRevealSnackbar();
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    }
  };

  // ======= Callback quand la réaction a changé (après modale) =======
  const handleReactionApplied = (result) => {
    // result = { my_reaction, reactions_summary }
    setDispDeposits?.((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      const idx = arr.findIndex((x) => x?.deposit_id === dep.deposit_id);
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          my_reaction: result?.my_reaction || null,
          reactions_summary: Array.isArray(result?.reactions_summary) ? result.reactions_summary : [],
        };
      }
      return arr;
    });
  };

  // Rendu compact d’un ruban de réactions (emoji × count)
  const ReactionsStrip = ({ items = [] }) => {
    if (!items || items.length === 0) return null;
    return (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1 }}>
        {items.map((it, i) => (
          <Box
            key={i}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{it.emoji}</span>
            <Typography variant="body2" component="span">
              × {it.count}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  // =========================
  // RENDU VARIANT MAIN
  // =========================
  if (variant === "main") {
    return (
      <>
        <Card className="deposit deposit_main">
          {showDate && (
            <Box className="deposit_date">
              <Box className="icon squaredesign" />
              <Typography className="squaredesign" variant="subtitle1" component="span">
                {"Déposée " + (dep?.deposit_date || "")}
              </Typography>
            </Box>
          )}

          {showUser && (
            <Box
              onClick={() => {
                if (u?.username) navigate("/profile/" + u.username);
              }}
              className={u?.username ? "hasUsername deposit_user" : "deposit_user"}
            >
              <Box className="squaredesign avatarbox">
                <Avatar src={u?.profile_pic_url || undefined} alt={u?.username || "Anonyme"} className="avatar" />
              </Box>
              <Typography component="span" className="username squaredesign" variant="subtitle1">
                {u?.username || "Anonyme"}
                {u?.username && <ArrowForwardIosIcon className="icon" />}
              </Typography>
            </Box>
          )}

          <Box className="deposit_song">
            <Box
              sx={{ aspectRatio: "1 / 1", width: "100%", maxWidth: "100%", overflow: "hidden" }}
              className="squaredesign img_container"
            >
              {s?.img_url && (
                <Box
                  component="img"
                  src={s.img_url}
                  alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                  sx={{ width: "100%", maxWidth: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
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

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
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
                <Button
                  variant="depositInteract"
                  size="large"
                  onClick={openReact}
                  startIcon={<EmojiEmotionsIcon />}
                >
                  Réagir
                </Button>
                
              </Box>
            </Box>

            {/* ruban des réactions */}
            <ReactionsStrip items={dep?.reactions_summary || []} />
            {dep?.my_reaction?.emoji && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Tu as réagi {dep.my_reaction.emoji}
              </Typography>
            )}
          </Box>
        </Card>

        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
        <ReactionModal
          open={reactOpen}
          onClose={closeReact}
          depositId={dep?.deposit_id}
          currentEmoji={dep?.my_reaction?.emoji || null}
          onApplied={handleReactionApplied}
        />
      </>
    );
  }

  // =========================
  // RENDU VARIANT LIST
  // =========================
  return (
    <>
      <Card className="deposit deposit_list">
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
            sx={{ display: "flex", minWidth: 0 }}
            onClick={() => {
              if (u?.username) navigate("/profile/" + u.username);
            }}
          >
            <Avatar src={u?.profile_pic_url || undefined} alt={u?.username || "Anonyme"} />
            <Typography>{u?.username || "Anonyme"}</Typography>
            {u?.username && <ArrowForwardIosIcon fontSize="small" />}
          </Box>
        )}

        <Box className="deposit_song">
          <Box
            sx={{ aspectRatio: "1 / 1", width: "100%", maxWidth: "100%", overflow: "hidden" }}
            className="squaredesign img_container"
          >
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
                  filter: isRevealed ? "none" : "blur(6px)",
                }}
              />
            )}
          </Box>

          <Box className="interact">
            {isRevealed ? (
              <>
                <Box className="texts">
                  <Typography component="span" className="titre squaredesign" variant="h4">
                    {s.title}
                  </Typography>
                  <Typography component="span" className="artist squaredesign" variant="body1">
                    {s.artist}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button
                    variant="depositInteract"
                    className="play playSecondary"
                    size="large"
                    onClick={() => openPlayFor(s)}
                    startIcon={<PlayArrowIcon />}
                  >
                    Play
                  </Button>

                  {/* Bouton Réagir sur list uniquement si révélé */}
                  <Button variant="depositInteract" size="large" onClick={openReact} startIcon={<EmojiEmotionsIcon />}>
                    Réagir
                  </Button>
                </Box>
              </>
            ) : (
              <>
                <Box className="texts">
                  <Typography component="span" className="titre squaredesign" variant="body1">
                    Utilise tes points pour révéler cette chanson
                  </Typography>
                </Box>
                <Button variant="depositInteract" onClick={revealDeposit} disabled={!user || !user.username} className="decouvrir">
                  Découvrir
                  <Box className="points_container" sx={{ ml: "12px" }}>
                    <Typography variant="body1" component="span">
                      {cost}
                    </Typography>
                    <AlbumIcon />
                  </Box>
                </Button>
              </>
            )}
          </Box>

          {/* ruban des réactions */}
          <ReactionsStrip items={dep?.reactions_summary || []} />
          {dep?.my_reaction?.emoji && isRevealed && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Tu as réagi {dep.my_reaction.emoji}
            </Typography>
          )}
        </Box>
      </Card>

      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

      {/* Snackbar existant */}
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
            >
              Voir
            </Button>
          }
        />
      </Snackbar>

      {/* Modale de réaction */}
      <ReactionModal
        open={reactOpen}
        onClose={closeReact}
        depositId={dep?.deposit_id}
        currentEmoji={dep?.my_reaction?.emoji || null}
        onApplied={handleReactionApplied}
      />
    </>
  );
}
