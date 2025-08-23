import React, { useState, useMemo } from "react";
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

import PlayModal from "../../Common/PlayModal.js";
import LiveSearch from "../LiveSearch.js";

export default function SongDisplay({
  dispDeposits,
  setDispDeposits,               // gardé si besoin futur
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
}) {
  const navigate = useRouterNavigate();

  // Sécurise la liste
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  // === ÉTATS LOCAUX ===
  // Play
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  // Drawer (full page mobile)
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("search"); // 'search' | 'achievements'

  // Dépôt tout juste ajouté (NON injecté dans dispDeposits)
  const [myDeposit, setMyDeposit] = useState(null);

  // Achievements (reçus après POST)
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

  // Rouvre le drawer en mode achievements
  const reopenAchievements = () => {
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

  // Callback après POST réussi (LiveSearch)
  const handleDepositSuccess = (addedDeposit, successes) => {
    setMyDeposit(addedDeposit || null);
    setAchievements(Array.isArray(successes) ? successes : []);
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

  // ---- Composant interne : carte "ma pépite" (révélée, compacte)
  const MyDepositCard = () => (
    <Card sx={{ p: 2, border: "1px dashed #e5e7eb" }}>
      {/* Titre H1 demandé */}
      <Typography component="h1" variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        La chanson que tu as déposée
      </Typography>

      {/* deposit_song (layout compact révélé) */}
      <Box
        id="deposit_song"
        sx={{
          display: "grid",
          gridTemplateColumns: "140px 1fr",
          gap: 2,
          mb: 1,
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
          <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700 }}>
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

      {/* Ligne d’info + points cliquables (à gauche texte, à droite points) */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          justifyContent: "space-between",
          mt: 1,
        }}
      >
        <Typography variant="body2" sx={{ flex: 1 }}>
          Utilise tes points pour révéler d&apos;autres pépites dans la boîte ou sur les profils d&apos;autres utilisateurs
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
        >
          +{totalPoints}
        </Box>
      </Box>
    </Card>
  );

  // ====== CASE: AUCUN DÉPÔT (boîte vide) ======
  if (deposits.length === 0) {
    return (
      <Box sx={{ p: 2, display: "grid", gap: 2 }}>
        {!myDeposit ? (
          // --- Avant dépôt ---
          <Card sx={{ p: 2 }}>
            <Typography component="h1" variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Ajoute chanson à ton tour pour gagner des crédits et pouvoir révéler d&apos;autres pépites.
            </Typography>
            <Button variant="contained" onClick={openSearch} fullWidth>
              Déposer une chanson
            </Button>
          </Card>
        ) : (
          // --- Après dépôt ---
          <MyDepositCard />
        )}

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
      </Box>
    );
  }

  // ====== CASE: AVEC DÉPÔTS ======
  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {/* HERO */}
      <Box
        id="intro"
        sx={{
          width: "100%",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          mt: "26px",
          mb: "26px",
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

      {deposits.map((dep, idx) => {
        const u = dep?.user;
        const s = dep?.song || {};
        const already = !!dep?.already_discovered;
        const isRevealed = already || Boolean(s?.title && s?.artist);

        const card = (
          <Card key={`dep-${dep?.deposit_id ?? idx}`} sx={{ p: 2 }}>
            {/* date */}
            <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
              {"Pépite déposée " + dep?.deposit_date}
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

            {/* song */}
            {idx === 0 ? (
              // ----- DÉPÔT #1 (plein format) -----
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
            ) : (
              // ----- DÉPÔTS SUIVANTS (layout compact) -----
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
                      <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700 }}>
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

            {/* actions secondaires */}
            <Box id="deposit_interact" sx={{ mt: 0 }}>
              {idx > 0 && !isRevealed ? (
                <Button variant="contained" size="large" disabled>
                  Découvrir — 300
                </Button>
              ) : idx > 0 && isRevealed ? (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {deposits[idx]?.discovered_at === "à l'instant"
                    ? "Découverte à l'instant"
                    : deposits[idx]?.discovered_at
                    ? `Découvert : ${deposits[idx].discovered_at}`
                    : null}
                </Typography>
              ) : null}
            </Box>
          </Card>
        );

        // Après le premier dépôt, on insère le CTA (avant dépôt) ou le bloc "ma pépite" (après dépôt).
        if (idx === 0) {
          return (
            <React.Fragment key={`first-frag`}>
              {card}

              {!myDeposit ? (
                <Card sx={{ p: 2 }}>
                  <Typography component="h1" variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                    Ajoute chanson à ton tour pour gagner des crédits et pouvoir révéler d&apos;autres pépites.
                  </Typography>
                  <Button variant="contained" onClick={openSearch}>
                    Déposer une chanson
                  </Button>
                </Card>
              ) : (
                <MyDepositCard />
              )}
            </React.Fragment>
          );
        }

        return card;
      })}

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
    </Box>
  );
}
