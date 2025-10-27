import React, { useState, useContext, useMemo, useEffect } from "react";
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
import ReactionModal from "../Reactions/ReactionModal";

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
  showReact = true,
  showPlay = true,
}) {
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext) || {};

  /** ---------- ÉTAT LOCAL SYNCHRO AVEC LA PROP ---------- */
  const [localDep, setLocalDep] = useState(dep || {});
  useEffect(() => {
    setLocalDep(dep || {});
  }, [dep]);

  const s = localDep?.song || {};
  const u = localDep?.user || {};
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

  // ---- Reveal d’un dépôt
  const revealDeposit = async () => {
    try {
      if (!user || !user.username) {
        const goLogin = window.confirm(
          "Crée-toi un compte pour pouvoir révéler cette chanson"
        );
        if (goLogin) {
          navigate(
            "/login?next=" +
              encodeURIComponent(window.location.pathname + window.location.search)
          );
        }
        return;
      }
      const csrftoken = getCookie("csrftoken");
      const res = await fetch("/box-management/revealSong", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
        body: JSON.stringify({ deposit_id: localDep.deposit_id }),
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

      const revealed = payload?.song || {};

      // MAJ locale immédiate
      setLocalDep((prev) => ({
        ...(prev || {}),
        discovered_at: "à l'instant",
        song: {
          ...(prev?.song || {}),
          title: revealed.title,
          artist: revealed.artist,
          spotify_url: revealed.spotify_url,
          deezer_url: revealed.deezer_url,
          img_url: revealed.img_url || prev?.song?.img_url,
        },
      }));

      // MAJ dans la liste parente si fournie
      setDispDeposits?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => x?.deposit_id === localDep.deposit_id);
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
              img_url: revealed.img_url || arr[idx]?.song?.img_url,
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
    // 1) MAJ locale immédiate pour refléter l’UI
    setLocalDep((prev) => ({
      ...(prev || {}),
      my_reaction: result?.my_reaction || null,
      reactions_summary: Array.isArray(result?.reactions_summary) ? result.reactions_summary : [],
    }));

    // 2) MAJ dans la liste parente si elle existe
    setDispDeposits?.((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      const idx = arr.findIndex((x) => x?.deposit_id === localDep.deposit_id);
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
      <Box className="reactions_container">
        {items.map((it, i) => (
          <Box key={`${it.emoji || i}-${it.count || 0}`} sx={{display : "flex", flexDirection:"row", alignItems:"center", gap:"4px"}}>
            <Typography variant="h4" component="span">
              {it.emoji}
            </Typography>
            <Typography variant="h5" component="span">
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
                {"Chanson déposée " + (localDep?.deposit_date || "") + "par :"}
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

          {/* ----- Section chanson ----- */}
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
                    <Typography component="span" className="titre squaredesign" variant="h4">
                      {s.title}
                    </Typography>
                    <Typography component="span" className="artist squaredesign" variant="body1">
                      {s.artist}
                    </Typography>
                  </>
                )}
              </Box>

              {/* Play uniquement ici, le bouton Réagir est dans deposit_react */}
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
              </Box>
            </Box>
          </Box>

          {/* ----- Section réactions dédiée ----- */}
          {showReact && (
            <Box className="deposit_react">
              <Button
                variant="outlined"
                size="large"
                onClick={() => (isRevealed ? openReact() : null)}
                disabled={!isRevealed}
                startIcon={<EmojiEmotionsIcon />}
              >
                Réagir
              </Button>

              {/* ruban des réactions */}
              <ReactionsStrip items={localDep?.reactions_summary || []} />
            </Box>
          )}
        </Card>

        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
        <ReactionModal
          open={reactOpen}
          onClose={closeReact}
          depositId={localDep?.deposit_id}
          currentEmoji={localDep?.my_reaction?.emoji || null}
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
              {"Déposée " + (localDep?.deposit_date || "")}
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

        {/* ----- Section chanson ----- */}
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
                  <Typography component="span" className="titre squaredesign" variant="h5">
                    {s.title}
                  </Typography>
                  <Typography component="span" className="artist squaredesign" variant="body2">
                    {s.artist}
                  </Typography>
                </Box>

                {/* Play conditionnel en LIST : dépend de showPlay */}
                {showPlay && (
                  <Button
                    variant="depositInteract"
                    className="play playSecondary"
                    size="large"
                    onClick={() => openPlayFor(s)}
                    startIcon={<PlayArrowIcon />}
                  >
                    Play
                  </Button>
                )}
              </>
            ) : (
              <>
                <Box className="texts">
                  <Typography component="span" className="titre squaredesign" variant="body1">
                    Utilise tes points pour révéler cette chanson
                  </Typography>
                </Box>
                <Button
                  variant="depositInteract"
                  onClick={revealDeposit}
                  className="decouvrir"
                >
                  Découvrir
                  <Box className="points_container" sx={{ ml: "12px" }}>
                    <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                      {cost}
                    </Typography>
                    <AlbumIcon />
                  </Box>
                </Button>
              </>
            )}
          </Box>
        </Box>

        {/* ----- Section réactions dédiée ----- */}
        {showReact && (
          <Box className="deposit_react">
            {isRevealed && (
              <Button
                variant="outlined"
                size="large"
                onClick={openReact}
                startIcon={<EmojiEmotionsIcon />}
              >
                Réagir
              </Button>
            )}

            {/* ruban des réactions toujours visible */}
            <ReactionsStrip items={localDep?.reactions_summary || []} />
          </Box>
        )}
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
        depositId={localDep?.deposit_id}
        currentEmoji={localDep?.my_reaction?.emoji || null}
        onApplied={handleReactionApplied}
      />
    </>
  );
}
