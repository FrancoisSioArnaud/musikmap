// frontend/src/components/Common/Deposit.js

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
import AddReactionIcon from "@mui/icons-material/AddReaction";

import PlayModal from "../Common/PlayModal";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import ReactionModal from "../Reactions/ReactionModal";
import ReactionSummary from "../Reactions/ReactionSummary";
import { getValid, setWithTTL } from "../Utils/mmStorage";
import { formatRelativeTime } from "../Utils/time";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 20;

function normalizeReactionUser(rawUser = {}) {
  const username = rawUser?.username || rawUser?.name || "";
  return {
    username: username || "",
    name: username || "anonyme",
    profile_picture_url:
      rawUser?.profile_picture_url || rawUser?.profile_pic_url || null,
    isAnonymous: !username || String(username).toLowerCase() === "anonyme",
  };
}

function upsertViewerReactionInList(reactions, nextEmoji, viewer) {
  const list = Array.isArray(reactions) ? [...reactions] : [];
  const viewerUsername = (viewer?.username || "").trim();

  if (!viewerUsername) return list;

  const withoutMine = list.filter(
    (r) => (r?.user?.name || "").trim() !== viewerUsername
  );

  if (!nextEmoji) {
    return withoutMine;
  }

  const myReaction = {
    emoji: nextEmoji,
    user: {
      name: viewerUsername,
      username: viewerUsername,
      profile_picture_url: viewer?.profile_picture_url || null,
      profile_pic_url: viewer?.profile_picture_url || null,
    },
  };

  return [myReaction, ...withoutMine];
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
  allowReact = true,
  showPlay = true,
}) {
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext) || {};

  const [localDep, setLocalDep] = useState(dep || {});
  useEffect(() => {
    setLocalDep(dep || {});
  }, [dep]);

  const s = localDep?.song || {};
  const u = localDep?.user || {};
  const isRevealed = useMemo(
    () => Boolean(s?.title && s?.artist),
    [s?.title, s?.artist]
  );

  const depositedAt = localDep?.deposited_at || null;
  const naturalDate = useMemo(
    () => (depositedAt ? formatRelativeTime(depositedAt) : ""),
    [depositedAt]
  );

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

  const [reactOpen, setReactOpen] = useState(false);
  const openReact = () => setReactOpen(true);
  const closeReact = () => setReactOpen(false);

  const [reactionSummaryOpen, setReactionSummaryOpen] = useState(false);
  const openReactionSummary = () => setReactionSummaryOpen(true);
  const closeReactionSummary = () => setReactionSummaryOpen(false);

  const [snackOpen, setSnackOpen] = useState(false);
  const showRevealSnackbar = () => {
    if (snackOpen) {
      setSnackOpen(false);
      setTimeout(() => setSnackOpen(true), 0);
    } else {
      setSnackOpen(true);
    }
  };

  const viewerUsername = (user?.username || "").trim();
  const myReactionEmoji = localDep?.my_reaction?.emoji || null;
  const reactionsDetail = Array.isArray(localDep?.reactions)
    ? localDep.reactions
    : [];
  const reactionsSummary = Array.isArray(localDep?.reactions_summary)
    ? localDep.reactions_summary
    : [];

  const updateLocalStorageSnapshot = (revealedSong) => {
    try {
      const snap = getValid(KEY_BOX_CONTENT);
      if (!snap) return;

      let changed = false;
      const next = { ...snap };
      const isoNow = new Date().toISOString();

      if (Array.isArray(snap.olderDeposits)) {
        next.olderDeposits = snap.olderDeposits.map((d) => {
          if (!d || d.public_key !== localDep.public_key) return d;

          changed = true;
          return {
            ...d,
            discovered_at: isoNow,
            song: {
              ...(d.song || {}),
              title: revealedSong.title,
              artist: revealedSong.artist,
              spotify_url: revealedSong.spotify_url,
              deezer_url: revealedSong.deezer_url,
              image_url: revealedSong.image_url || d.song?.image_url,
            },
          };
        });
      }

      if (!changed) return;

      next.timestamp = Date.now();
      setWithTTL(KEY_BOX_CONTENT, next, TTL_MINUTES);
    } catch (e) {}
  };

  const revealDeposit = async () => {
    try {
      if (!user || !user.username) {
        const goLogin = window.confirm(
          "Crée-toi un compte pour cumuler tes points et pouvoir révéler cette chanson"
        );
        if (goLogin) {
          navigate(
            "/login?next=" +
              encodeURIComponent(
                window.location.pathname + window.location.search
              )
          );
        }
        return;
      }

      const csrftoken = getCookie("csrftoken");
      const res = await fetch("/box-management/revealSong", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify({ dep_public_key: localDep.public_key }),
        credentials: "same-origin",
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (payload?.message) {
          alert(payload.message);
        } else if (payload?.error === "insufficient_funds") {
          alert("Tu n’as pas assez de points pour effectuer cette action.");
        } else {
          alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
        }
        return;
      }

      const revealed = payload?.song || {};
      const isoNow = new Date().toISOString();

      setLocalDep((prev) => ({
        ...(prev || {}),
        discovered_at: isoNow,
        song: {
          ...(prev?.song || {}),
          title: revealed.title,
          artist: revealed.artist,
          spotify_url: revealed.spotify_url,
          deezer_url: revealed.deezer_url,
          image_url: revealed.image_url || prev?.song?.image_url,
        },
      }));

      setDispDeposits?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => x?.deposit_id === localDep.deposit_id);
        if (idx >= 0) {
          arr[idx] = {
            ...arr[idx],
            discovered_at: isoNow,
            song: {
              ...(arr[idx]?.song || {}),
              title: revealed.title,
              artist: revealed.artist,
              spotify_url: revealed.spotify_url,
              deezer_url: revealed.deezer_url,
              image_url: revealed.image_url || arr[idx]?.song?.image_url,
            },
          };
        }
        return arr;
      });

      updateLocalStorageSnapshot(revealed);

      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((p) => ({ ...(p || {}), points: payload.points_balance }));
      }

      showRevealSnackbar();
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    }
  };

  const handleOpenReactModal = () => {
    if (!user || !user.username) {
      window.alert("Connecte-toi pour ajouter une réaction à cette chanson");
      return;
    }
    openReact();
  };

  const handleReactionApplied = (result) => {
    const nextReactions = upsertViewerReactionInList(
      localDep?.reactions || [],
      result?.my_reaction?.emoji || null,
      user
    );

    setLocalDep((prev) => ({
      ...(prev || {}),
      my_reaction: result?.my_reaction || null,
      reactions_summary: Array.isArray(result?.reactions_summary)
        ? result.reactions_summary
        : [],
      reactions: nextReactions,
    }));

    setDispDeposits?.((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      const idx = arr.findIndex((x) => x?.deposit_id === localDep.deposit_id);
      if (idx >= 0) {
        arr[idx] = {
          ...arr[idx],
          my_reaction: result?.my_reaction || null,
          reactions_summary: Array.isArray(result?.reactions_summary)
            ? result.reactions_summary
            : [],
          reactions: nextReactions,
        };
      }
      return arr;
    });
  };

  const renderDepositUser = (userObj) => (
    <Box
      onClick={() => {
        if (userObj?.username) navigate("/profile/" + userObj.username);
      }}
      className={userObj?.username ? "hasUsername deposit_user" : "deposit_user"}
    >
      <Typography variant="body1" component="span">
        Partagée par
      </Typography>
      <Box className=" avatarbox">
        <Avatar
          src={userObj?.profile_pic_url || undefined}
          alt={userObj?.username || "anonyme"}
          className="avatar"
        />
      </Box>
      <Typography component="span" className="username " variant="subtitle1">
        {userObj?.username || "anonyme"}
        {userObj?.username && <ArrowForwardIosIcon className="icon" />}
      </Typography>
    </Box>
  );

  const ReactionsStrip = ({
    items = [],
    reactions = [],
    myReactionEmoji = null,
    viewerUsername = null,
    onOpenReact,
    onOpenSummary,
  }) => {
    const list = Array.isArray(items) ? items : [];
    const rx = Array.isArray(reactions) ? reactions : [];

    const currentEmoji =
      myReactionEmoji ??
      (viewerUsername
        ? rx.find((r) => (r?.user?.name || "").trim() === viewerUsername)?.emoji ??
          null
        : null);

    const hasMyReaction = Boolean(currentEmoji);

    return (
      <Box className="deposit_react" sx={{ userSelect: "none" }}>
        {list.map((it, i) => {
          const isCurrent = Boolean(currentEmoji && it?.emoji === currentEmoji);

          const handleClick = (e) => {
            e.stopPropagation();
            if (isCurrent) {
              onOpenReact?.();
            } else {
              onOpenSummary?.();
            }
          };

          const handleKeyDown = (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClick(e);
            }
          };

          return (
            <Box
              key={`${it?.emoji || i}-${it?.count || 0}`}
              className={isCurrent ? "current_reaction reaction" : "reaction"}
              role="button"
              tabIndex={0}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              sx={{ cursor: "pointer" }}
            >
              <Typography variant="h4" component="span">
                {it?.emoji}
              </Typography>
              <Typography variant="h5" component="span">
                × {it?.count}
              </Typography>
            </Box>
          );
        })}

        {!hasMyReaction && (
          <Box
            className="icon_container"
            aria-label="Réagir"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenReact?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onOpenReact?.();
              }
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              p: "8px 12px",
              cursor: "pointer",
            }}
          >
            <AddReactionIcon
              color="primary"
              sx={{ height: "1.6em", width: "1.6em" }}
            />
          </Box>
        )}
      </Box>
    );
  };

  if (variant === "main") {
    return (
      <>
        <Box className="deposit_container">
          {showDate && (
            <Typography className="deposit_date" variant="subtitle1" component="span">
              {"Chanson partagée " + (naturalDate || "")}
            </Typography>
          )}
          <Card className="deposit deposit_main">
            <Box className="deposit_song">
              <Box className=" img_container">
                {s?.image_url && (
                  <Box
                    component="img"
                    src={s.image_url}
                    alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                  />
                )}
              </Box>

              <Box className="interact">
                <Box className="texts">
                  <Typography component="span" className="titre " variant="h4">
                    {s.title}
                  </Typography>
                  <Typography component="span" className="artist " variant="body1">
                    {s.artist}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button
                    variant="depositInteract"
                    className="play playMain"
                    size="large"
                    onClick={() => openPlayFor(s)}
                    startIcon={<PlayArrowIcon />}
                  >
                    Écouter la chanson
                  </Button>
                </Box>
              </Box>
            </Box>

            <Box className="deposit_infos">
              {showUser && renderDepositUser(u)}

              <ReactionsStrip
                items={reactionsSummary}
                reactions={reactionsDetail}
                myReactionEmoji={myReactionEmoji}
                viewerUsername={viewerUsername}
                onOpenReact={handleOpenReactModal}
                onOpenSummary={openReactionSummary}
              />
            </Box>
          </Card>
        </Box>

        <ReactionModal
          open={reactOpen}
          onClose={closeReact}
          depPublicKey={localDep?.public_key}
          currentEmoji={myReactionEmoji}
          onApplied={handleReactionApplied}
        />

        <ReactionSummary
          open={reactionSummaryOpen}
          onClose={closeReactionSummary}
          depPublicKey={localDep?.public_key}
          reactions={reactionsDetail}
          viewer={user}
          onApplied={handleReactionApplied}
        />

        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
      </>
    );
  }

  return (
    <>
      <Box className="deposit_container">
        {showDate && (
          <Typography className="deposit_date" variant="subtitle1" component="span">
            {naturalDate || ""}
          </Typography>
        )}
        <Card className="deposit deposit_list">
          <Box className="deposit_song">
            <Box className=" img_container">
              {s?.image_url && (
                <Box
                  component="img"
                  src={s.image_url}
                  alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                  sx={{
                    filter: isRevealed ? "none" : "blur(6px)",
                  }}
                />
              )}
            </Box>

            <Box className="interact">
              {isRevealed ? (
                <>
                  <Box className="texts">
                    <Typography component="span" className="titre " variant="h5">
                      {s.title}
                    </Typography>
                    <Typography component="span" className="artist " variant="body1">
                      {s.artist}
                    </Typography>
                  </Box>

                  {showPlay && (
                    <Button
                      variant="depositInteract"
                      className="play playSecondary"
                      size="large"
                      onClick={() => openPlayFor(s)}
                      startIcon={<PlayArrowIcon />}
                    >
                      Écouter
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Box className="texts">
                    <Typography component="span" className="titre" variant="body1">
                      Utilise tes points pour révéler cette chanson
                    </Typography>
                  </Box>
                  <Button variant="depositInteract" onClick={revealDeposit} className="decouvrir">
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

          <Box className="deposit_infos">
            {showUser && renderDepositUser(u)}

            <ReactionsStrip
              items={reactionsSummary}
              reactions={reactionsDetail}
              myReactionEmoji={myReactionEmoji}
              viewerUsername={viewerUsername}
              onOpenReact={handleOpenReactModal}
              onOpenSummary={openReactionSummary}
            />
          </Box>
        </Card>
      </Box>

      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

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

      <ReactionModal
        open={reactOpen}
        onClose={closeReact}
        depPublicKey={localDep?.public_key}
        currentEmoji={myReactionEmoji}
        onApplied={handleReactionApplied}
      />

      <ReactionSummary
        open={reactionSummaryOpen}
        onClose={closeReactionSummary}
        depPublicKey={localDep?.public_key}
        reactions={reactionsDetail}
        viewer={user}
        onApplied={handleReactionApplied}
      />
    </>
  );
}
