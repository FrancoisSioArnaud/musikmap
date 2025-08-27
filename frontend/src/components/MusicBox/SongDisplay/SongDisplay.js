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
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

/* Snackbar + Slide + Content + Icon */
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Slide from "@mui/material/Slide";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";

import PlayModal from "../../Common/PlayModal.js";
import LiveSearch from "./LiveSearch.js";
import { getCookie } from "../../Security/TokensUtils";
import { UserContext } from "../../UserContext";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

export default function SongDisplay({
  dispDeposits,
  setDispDeposits, // maj après reveal
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
  revealCost, // coût serveur pour reveal
}) {
  const navigate = useRouterNavigate();
  const { setUser } = useContext(UserContext) || {};

  const cost = typeof revealCost === "number" ? revealCost : 40;

  // Liste sécurisée
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  // === ÉTATS LOCAUX ===
  // Play
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  // Drawer (LiveSearch / Achievements)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("search"); // 'search' | 'achievements'

  // Dépôt tout juste ajouté (retour POST add-song)
  const [myDeposit, setMyDeposit] = useState(null);

  // Succès + total points
  const [achievements, setAchievements] = useState([]);
  const totalPoints = useMemo(() => {
    const item = achievements.find(
      (s) => (s?.name || "").toLowerCase() === "total"
    );
    return item?.points ?? 0;
  }, [achievements]);
  const displaySuccesses = useMemo(
    () => achievements.filter((s) => (s?.name || "").toLowerCase() !== "total"),
    [achievements]
  );

  // Snackbar confirm
  const [snackOpen, setSnackOpen] = useState(false);
  const showRevealSnackbar = () => {
    if (snackOpen) {
      setSnackOpen(false);
      setTimeout(() => setSnackOpen(true), 0);
    } else {
      setSnackOpen(true);
    }
  };

  // --- PLAY ---
  const openPlayFor = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };
  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  // --- Drawer / LiveSearch ---
  const openSearch = () => {
    if (myDeposit) return; // un seul dépôt possible
    setDrawerView("search");
    setIsSearchOpen(true);
  };
  const closeSearch = () => {
    setIsSearchOpen(false);
  };
  const reopenAchievements = () => {
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

  // Callback après POST add-song (LiveSearch)
  const handleDepositSuccess = (addedDeposit, successes) => {
    setMyDeposit(addedDeposit || null);
    setAchievements(Array.isArray(successes) ? successes : []);
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

  // ---- Auto-enregistrer le dépôt #0 comme "main" au montage ----
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
    })
      .then(() => {})
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Reveal d’un dépôt (débit + découverte + maj UI + maj points) ----
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

      // 1) MAJ visuelle: remplace le teaser par la chanson révélée
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

      // 2) MAJ du solde (UserContext)
      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((p) => ({ ...(p || {}), points: payload.points_balance }));
      }

      // 3) Snackbar OK
      showRevealSnackbar();
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    }
  };

  /* ===========================
     SECTION — MY_DEPOSIT
     =========================== */

  // Avant dépôt : H1 + paragraphe + box vide pointillée ratio 5:2 + bouton centré
  const MyDepositEmpty = () => (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
        Dépose une chanson
      </Typography>
      <Typography variant="body1">
        Ajoute une chanson et gagne des crédits pour pouvoir révéler des pépites plus anciennes.
      </Typography>

      <Box
        sx={{
          mt: 1,
          width: "100%",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          p: 1.5,
          // Ratio 5:2
          aspectRatio: "5 / 2",
        }}
      >
        <Button variant="contained" size="large" onClick={openSearch}>
          Déposer une chanson
        </Button>
      </Box>
    </Box>
  );

  // Après dépôt : H1 + check + paragraphe + bouton points (ouvre achievements) + box pointillée avec la chanson
  const MyDepositAfter = () => (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
        Ta chanson est déposée
        <CheckCircleIcon sx={{ color: "success.main" }} fontSize="medium" />
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography variant="body1" sx={{ flex: 1 }}>
          Révèle d’autres chansons avec les crédits que tu as gagnés.
        </Typography>
        <Button
          variant="contained"
          onClick={reopenAchievements}
          aria-label="Ouvrir les succès"
        >
          +{totalPoints}
        </Button>
      </Box>

      <Box
        sx={{
          mt: 0.5,
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          p: 1.5, // 12px
        }}
      >
        {/* Section chanson (layout compact) */}
        <Box
          id="my_deposit_song"
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
              onClick={() => openPlayFor(myDeposit?.song)}
              sx={{ alignSelf: "flex-start", mt: 0.5 }}
            >
              Play
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  /* ===========================
     RENDU
     =========================== */

  // AUCUN dépôt côté boîte → on montre uniquement my_deposit (avant/après)
  if (deposits.length === 0) {
    return (
      <Box sx={{ p: 2, display: "grid", gap: 2 }}>
        {/* marges 42px autour de la section */}
        <Box sx={{ mt: "42px", mb: "42px" }}>
          {!myDeposit ? <MyDepositEmpty /> : <MyDepositAfter />}
        </Box>

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

        {/* Snackbar globale */}
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

  // AVEC dépôts → on rend les 10 premiers, puis my_deposit (avec marges 42px),
  // puis une section dédiée pour idx > 9 avec un titre H2.
  const firstTen = deposits.slice(0, 10);
  const olderDeposits = deposits.slice(10);

  const renderDepositCard = (dep, idxGlobal) => {
    const u = dep?.user;
    const s = dep?.song || {};
    const isRevealed = Boolean(s?.title && s?.artist);

    return (
      <Card key={`dep-${dep?.deposit_id ?? idxGlobal}`} sx={{ p: 2 }}>
        {/* Utilisateur */}
        <Box
          id="deposit_user"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 2,
            cursor: u?.id != null ? "pointer" : "default",
          }}
          onClick={() => {
            if (u?.id != null) navigate("/profile/" + u.id);
          }}
        >
          <Avatar
            src={u?.profile_pic_url || undefined}
            alt={u?.name || "Anonyme"}
            sx={{ width: 40, height: 40 }}
          />
          <Typography>{u?.name || "Anonyme"}</Typography>
        </Box>

        {/* Song */}
        {idxGlobal === 0 ? (
          // Dépôt #1 (plein format)
          <Box id="deposit_song" sx={{ display: "grid", gap: 1, mb: 2 }}>
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
        ) : (
          // Dépôts suivants (compact)
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
        )}

        {/* Actions secondaires */}
        <Box id="deposit_interact" sx={{ mt: 0 }}>
          {idxGlobal > 0 && !isRevealed ? (
            <Button
              variant="contained"
              size="large"
              onClick={() => revealDeposit(dep)}
              disabled={!user || !user.username}
            >
              {`Découvrir — ${cost}`}
            </Button>
          ) : null}
        </Box>
      </Card>
    );
  };

  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {/* Intro courte */}
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

      {/* 10 premiers dépôts */}
      {firstTen.map((dep, idx) => renderDepositCard(dep, idx))}

      {/* Section MY_DEPOSIT avec marges 42px */}
      <Box sx={{ mt: "42px", mb: "42px" }}>
        {!myDeposit ? <MyDepositEmpty /> : <MyDepositAfter />}
      </Box>

      {/* Section dédiée pour les dépôts > 9 */}
      {olderDeposits.length > 0 && (
        <Box sx={{ display: "grid", gap: 2 }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
            Chansons déposées plus tôt à révéler
          </Typography>

          {olderDeposits.map((dep, subIdx) => {
            // subIdx part de 0 ici, mais l'index global est 10 + subIdx
            const idxGlobal = 10 + subIdx;
            return renderDepositCard(dep, idxGlobal);
          })}
        </Box>
      )}

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

      {/* Snackbar globale */}
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
