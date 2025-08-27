import React, { useState, useMemo, useContext, useEffect } from "react";
import { useNavigate as useRouterNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";

/* === Snackbar + Slide + Content + Icon === */
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Slide from "@mui/material/Slide";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import PlayModal from "../../Common/PlayModal.js";
import LiveSearch from "./LiveSearch.js";
import { getCookie } from "../../Security/TokensUtils";
import { UserContext } from "../../UserContext";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

export default function SongDisplay({
  dispDeposits,
  setDispDeposits, // utilisé pour maj après reveal
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
  revealCost,
}) {
  const navigate = useRouterNavigate();
  const { setUser } = useContext(UserContext) || {};
  const cost = typeof revealCost === "number" ? revealCost : 40;

  // Sécurise la liste
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  // === ÉTATS LOCAUX ===
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("search"); // 'search' | 'achievements'

  // Dépôt tout juste ajouté (NON injecté dans dispDeposits)
  const [myDeposit, setMyDeposit] = useState(null);
  const [achievements, setAchievements] = useState([]);

  // Snackbar confirm
  const [snackOpen, setSnackOpen] = useState(false);

  const totalPoints = useMemo(() => {
    const item = achievements.find((s) => (s?.name || "").toLowerCase() === "total");
    return item?.points ?? 0;
  }, [achievements]);

  const displaySuccesses = useMemo(
    () => achievements.filter((s) => (s?.name || "").toLowerCase() !== "total"),
    [achievements]
  );

  // --- PLAY ---
  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

  // --- Drawer / LiveSearch ---
  const openSearch = () => {
    if (myDeposit) return; // un seul dépôt possible
    setDrawerView("search");
    setIsSearchOpen(true);
  };
  const closeSearch = () => setIsSearchOpen(false);
  const reopenAchievements = () => { setDrawerView("achievements"); setIsSearchOpen(true); };

  // Callback après POST réussi (LiveSearch)
  const handleDepositSuccess = (addedDeposit, successes) => {
    setMyDeposit(addedDeposit || null);
    setAchievements(Array.isArray(successes) ? successes : []);
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

  // Auto-enregistrer le dépôt #0 comme "main" au montage (si connecté)
  useEffect(() => {
    if (!user || !user.username) return;
    const first = Array.isArray(dispDeposits) && dispDeposits.length > 0 ? dispDeposits[0] : null;
    const firstId = first?.deposit_id;
    if (!firstId) return;

    const csrftoken = getCookie("csrftoken");
    fetch("/box-management/discovered-songs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      body: JSON.stringify({ deposit_id: firstId, discovered_type: "main" }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showRevealSnackbar = () => {
    if (snackOpen) {
      setSnackOpen(false);
      setTimeout(() => setSnackOpen(true), 0);
    } else {
      setSnackOpen(true);
    }
  };

  // ---- Reveal d’un dépôt ----
  const revealDeposit = async (dep) => {
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

      // MAJ visuelle
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

      // MAJ points (menu)
      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((p) => ({ ...(p || {}), points: payload.points_balance }));
      }

      showRevealSnackbar();
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    }
  };

  /* =========================================================
     COMPOSANTS SECONDAIRES (UI)
  ========================================================= */

  // Carte compacte (chanson déposée par l'utilisateur) — utilisée en "après dépôt"
  const MyDepositSongCompact = () => (
    <Box
      id="deposit_song"
      sx={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 2,
        alignItems: "center",
      }}
    >
      <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
        {myDeposit?.song?.img_url && (
          <Box
            component="img"
            src={myDeposit.song.img_url}
            alt={`${myDeposit.song.title} - ${myDeposit.song.artist}`}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
          {myDeposit?.song?.title}
        </Typography>
        <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
          {myDeposit?.song?.artist}
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => openPlayFor(myDeposit.song)}
          sx={{ alignSelf: "flex-start", mt: 0.5 }}
        >
          Play
        </Button>
      </Box>
    </Box>
  );

  // SECTION — MY_DEPOSIT (avant/après)
  const MyDepositSection = () => {
    const before = !myDeposit;

    return (
      <Box
        id="my_deposit"
        sx={{
          mt: "42px",
          mb: "42px",
          display: "grid",
          gap: 2,
        }}
      >
        {before ? (
          <>
            {/* Avant dépôt */}
            <Typography component="h1" variant="h5" sx={{ fontWeight: 700, textAlign: "left" }}>
              Dépose une chanson
            </Typography>

            <Typography variant="body1" sx={{ textAlign: "left" }}>
              Ajoute chanson et gagne des crédits pour pouvoir révéler des pépites plus anciennes.
            </Typography>

            <Box
              sx={{
                border: "2px dashed #cbd5e1",
                borderRadius: 2,
                p: 2,
                display: "grid",
                placeItems: "center",
                // ratio 5:2 (largeur/hauteur)
                aspectRatio: "5 / 2",
                width: "100%",
                bgcolor: "transparent",
              }}
            >
              <Button variant="contained" size="large" onClick={openSearch}>
                Déposer une chanson
              </Button>
            </Box>
          </>
        ) : (
          <>
            {/* Après dépôt */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Typography component="h1" variant="h5" sx={{ fontWeight: 700, textAlign: "left" }}>
                Ta chanson est déposée
              </Typography>
              <CheckCircleIcon color="success" fontSize="medium" />
            </Box>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                justifyContent: "space-between",
                flexWrap: "wrap",
              }}
            >
              <Typography variant="body1" sx={{ textAlign: "left", flex: "1 1 auto", minWidth: 220 }}>
                Révèle d&apos;autres chansons avec les crédits que tu as gagnés.
              </Typography>

              <Box
                role="button"
                tabIndex={0}
                onClick={reopenAchievements}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && reopenAchievements()}
                sx={{
                  px: 2,
                  py: 1,
                  borderRadius: 1.5,
                  fontWeight: 700,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  userSelect: "none",
                }}
                aria-label="Voir les succès gagnés"
              >
                +{totalPoints}
              </Box>
            </Box>

            <Box
              sx={{
                border: "2px dashed #cbd5e1",
                borderRadius: 2,
                p: "12px",
              }}
            >
              <MyDepositSongCompact />
            </Box>
          </>
        )}
      </Box>
    );
  };

  /* =========================================================
     RENDU — CAS AUCUNE PÉPITE
  ========================================================= */
  if (deposits.length === 0) {
    return (
      <Box sx={{ p: 2, display: "grid", gap: 2 }}>
        {/* Section my_deposit seule (avant ou après) */}
        <MyDepositSection />

        {/* Drawer LiveSearch / Achievements */}
        <Drawer
          anchor="right"
          open={isSearchOpen}
          onClose={() => {}}
          ModalProps={{ keepMounted: true, disableRestoreFocus: true }}
          PaperProps={{ sx: { width: "100vw" } }}
        >
          <Box sx={{ p: 2, display: "grid", gap: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <IconButton aria-label="Fermer" onClick={closeSearch}>
                <CloseIcon />
              </IconButton>
            </Box>

            {drawerView === "search" ? (
              <LiveSearch
                isSpotifyAuthenticated={isSpotifyAuthenticated}
                isDeezerAuthenticated={isDeezerAuthenticated}
                boxName={boxName}
                user={user}
                onDepositSuccess={handleDepositSuccess}
                onClose={closeSearch}
              />
            ) : (
              <Box sx={{ display: "grid", gap: 1 }}>
                <Typography variant="h6">Bravo !</Typography>

                <List sx={{ mt: 1 }}>
                  {displaySuccesses.length === 0 && (
                    <ListItem>
                      <ListItemText primary="Aucun succès (hors Total)" />
                    </ListItem>
                  )}
                  {displaySuccesses.map((ach, i) => (
                    <ListItem key={i} divider>
                      <ListItemText primary={ach.name} secondary={ach.desc} />
                      <Typography variant="body2">+{ach.points}</Typography>
                    </ListItem>
                  ))}
                </List>

                <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Total
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    +{totalPoints}
                  </Typography>
                </Box>

                <Button variant="contained" onClick={closeSearch} sx={{ mt: 2 }}>
                  Revenir à la boîte
                </Button>
              </Box>
            )}
          </Box>
        </Drawer>

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
              maxWidth: "calc(100vw - 32px)",
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
      </Box>
    );
  }

  /* =========================================================
     RENDU — CAS AVEC PÉPITES
  ========================================================= */
  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {/* HERO simple */}
      <Box
        id="intro"
        sx={{
          width: "100%",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          mt: "16px",
          mb: "16px",
          p: 2,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            La dernière chanson déposée ici
          </Typography>
          <Typography component="span" variant="subtitle2" sx={{ opacity: 0.8 }}>
            (par un vrai humain.e)
          </Typography>
        </Box>
      </Box>

      {/* Dépôt idx === 0 (plein format) */}
      {(() => {
        const dep = deposits[0];
        const u = dep?.user;
        const s = dep?.song || {};
        const isRevealed = Boolean(s?.title && s?.artist);

        return (
          <Card key={`dep-${dep?.deposit_id ?? 0}`} sx={{ p: 2 }}>
            {/* date dépôt */}
            <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {"Pépite déposée " + (dep?.deposit_date || "") + "."}
            </Box>

            {/* user */}
            <Box
              id="deposit_user"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 2,
                cursor: u?.id != null ? "pointer" : "default",
              }}
              onClick={() => { if (u?.id != null) navigate("/profile/" + u.id); }}
            >
              <Avatar
                src={u?.profile_pic_url || undefined}
                alt={u?.name || "Anonyme"}
                sx={{ width: 40, height: 40 }}
              />
              <Typography>{u?.name || "Anonyme"}</Typography>
            </Box>

            {/* song */}
            <Box id="deposit_song" sx={{ display: "grid", gap: 1, mb: 2 }}>
              {/* cover carré full width */}
              <Box sx={{ width: "100%", borderRadius: 1, overflow: "hidden" }}>
                {s?.img_url && (
                  <Box
                    component="img"
                    src={s.img_url}
                    alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
                    sx={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      objectFit: "cover",
                      display: "block",
                      filter: isRevealed ? "none" : "blur(6px) brightness(0.9)",
                    }}
                  />
                )}
              </Box>

              {/* titres + Play */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
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

            {/* actions secondaires (rien pour le #0) */}
          </Card>
        );
      })()}

      {/* SECTION — MY_DEPOSIT (42px marges) */}
      <MyDepositSection />

      {/* SECTION — OLDER DEPOSITS (idx > 0) */}
      <Box id="older_deposits" sx={{ display: "grid", gap: "12px", mt: "32px" }}>
        <Typography component="h2" variant="h6" sx={{ fontWeight: 700, textAlign: "left", mb: "8px" }}>
          Chansons déposées plus tôt à révéler
        </Typography>

        {deposits.slice(1).map((dep, idx) => {
          const u = dep?.user;
          const s = dep?.song || {};
          const isRevealed = Boolean(s?.title && s?.artist);

          return (
            <Card key={`dep-${dep?.deposit_id ?? `older-${idx}`}`} sx={{ p: 2 }}>
              {/* date dépôt */}
              <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
                {"Pépite déposée " + (dep?.deposit_date || "") + "."}
              </Box>

              {/* user */}
              <Box
                id="deposit_user"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  mb: 2,
                  cursor: u?.id != null ? "pointer" : "default",
                }}
                onClick={() => { if (u?.id != null) navigate("/profile/" + u.id); }}
              >
                <Avatar
                  src={u?.profile_pic_url || undefined}
                  alt={u?.name || "Anonyme"}
                  sx={{ width: 40, height: 40 }}
                />
                <Typography>{u?.name || "Anonyme"}</Typography>
              </Box>

              {/* layout compact */}
              <Box
                id="deposit_song"
                sx={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: 2,
                  mb: 2,
                  alignItems: "center",
                }}
              >
                <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
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

                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  {isRevealed && (
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
                  )}
                </Box>
              </Box>

              {/* CTA reveal si non révélé */}
              {!isRevealed ? (
                <Box id="deposit_interact" sx={{ mt: 0 }}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={() => revealDeposit(dep)}
                    disabled={!user || !user.username}
                  >
                    {`Découvrir — ${cost}`}
                  </Button>
                </Box>
              ) : null}
            </Card>
          );
        })}
      </Box>

      {/* PLAY MODAL */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

      {/* DRAWER (LiveSearch / Achievements) */}
      <Drawer
        anchor="right"
        open={isSearchOpen}
        onClose={() => {}} // pas de fermeture backdrop/ESC
        ModalProps={{ keepMounted: true, disableRestoreFocus: true }}
        PaperProps={{ sx: { width: "100vw" } }}
      >
        <Box sx={{ p: 2, display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <IconButton aria-label="Fermer" onClick={closeSearch}>
              <CloseIcon />
            </IconButton>
          </Box>

          {drawerView === "search" ? (
            <LiveSearch
              isSpotifyAuthenticated={isSpotifyAuthenticated}
              isDeezerAuthenticated={isDeezerAuthenticated}
              boxName={boxName}
              user={user}
              onDepositSuccess={handleDepositSuccess}
              onClose={closeSearch}
            />
          ) : (
            <Box sx={{ display: "grid", gap: 1 }}>
              <Typography variant="h6">Bravo !</Typography>

              <List sx={{ mt: 1 }}>
                {displaySuccesses.length === 0 && (
                  <ListItem>
                    <ListItemText primary="Aucun succès (hors Total)" />
                  </ListItem>
                )}
                {displaySuccesses.map((ach, i) => (
                  <ListItem key={i} divider>
                    <ListItemText primary={ach.name} secondary={ach.desc} />
                    <Typography variant="body2">+{ach.points}</Typography>
                  </ListItem>
                ))}
              </List>

              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Total
                </Typography>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  +{totalPoints}
                </Typography>
              </Box>

              <Button variant="contained" onClick={closeSearch} sx={{ mt: 2 }}>
                Revenir à la boîte
              </Button>
            </Box>
          )}
        </Box>
      </Drawer>

      {/* SNACKBAR */}
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
    </Box>
  );
}
