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

  // ...state & reveal identiques

  // helpers de style (inchangés)
  const cardBaseSx = fitContainer
    ? { p: 2, width: "100%", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }
    : { p: 2, width: "calc(80vw - 32px)", maxWidth: 720, flex: "0 0 auto", boxSizing: "border-box", overflow: "hidden" };

  // ---------- VARIANT MAIN ----------
  if (variant === "main") {
    return (
      <>
        <Card sx={cardBaseSx}>
          {showDate && (
            <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {"Pépite déposée " + (dep?.deposit_date || "") + "."}
            </Box>
          )}

          {showUser && (
            <Box
              id="deposit_user"
              sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, cursor: u?.username ? "pointer" : "default", minWidth: 0 }}
              onClick={() => { if (u?.username) navigate("/profile/" + u.username); }}
            >
              <Avatar src={u?.profile_pic_url || undefined} alt={u?.username || "Anonyme"} sx={{ width: 40, height: 40, flex: "0 0 auto" }} />
              <Typography sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u?.username || "Anonyme"}
              </Typography>
            </Box>
          )}

          {/* contenu main inchangé */}
          <Box id="deposit_song" sx={{ display: "grid", gap: 1, mb: 2, minWidth: 0 }}>
            <Box sx={{ width: "100%", maxWidth: "100%", borderRadius: 1, overflow: "hidden" }}>
              {s?.img_url && (
                <Box
                  component="img"
                  src={s.img_url}
                  alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                  sx={{ width: "100%", maxWidth: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                />
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, minWidth: 0 }}>
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
              <Button variant="contained" size="large" onClick={() => (isRevealed ? openPlayFor(s) : null)} disabled={!isRevealed}>
                Play
              </Button>
            </Box>
          </Box>
        </Card>

        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
      </>
    );
  }

  // ---------- VARIANT LIST ----------
  return (
    <>
      <Card sx={cardBaseSx}>
        {showDate && (
          <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
            {"Pépite déposée " + (dep?.deposit_date || "") + "."}
          </Box>
        )}

        {showUser && (
          <Box
            id="deposit_user"
            sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2, cursor: u?.username ? "pointer" : "default", minWidth: 0 }}
            onClick={() => { if (u?.username) navigate("/profile/" + u.username); }}
          >
            <Avatar src={u?.profile_pic_url || undefined} alt={u?.username || "Anonyme"} sx={{ width: 40, height: 40, flex: "0 0 auto" }} />
            <Typography sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u?.username || "Anonyme"}
            </Typography>
          </Box>
        )}

        {/* zone chanson + overlay / boutons identique */}
        <Box
          id="deposit_song"
          sx={{ position: "relative", display: "grid", gridTemplateColumns: "140px 1fr", gap: 2, mb: 2, alignItems: "center", minWidth: 0 }}
        >
          <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden", flex: "0 0 auto" }}>
            {s?.img_url && (
              <Box
                component="img"
                src={s.img_url}
                alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: isRevealed ? "none" : "blur(6px) brightness(0.9)" }}
              />
            )}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            {isRevealed ? (
              <>
                <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
                  {s.title}
                </Typography>
                <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
                  {s.artist}
                </Typography>
                <Button variant="contained" size="large" onClick={() => openPlayFor(s)} sx={{ alignSelf: "flex-start", mt: 0.5 }}>
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
            <Button size="small" onClick={() => { setSnackOpen(false); navigate("/profile"); }} aria-label="Voir la chanson dans mon profil">
              Voir
            </Button>
          }
        />
      </Snackbar>
    </>
  );
}
