import * as React from "react";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";

import PlayModal from "../../Common/PlayModal";
import LiveSearch from "../LiveSearch";
import AchievementModal from "../AchievementModal";

export default function SongDisplay({
  dispDeposits,
  setDispDeposits,
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
}) {
  const navigate = useNavigate();

  // Liste dépôts (sécurise le mapping)
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  // === ÉTATS LOCAUX ===
  // Modale PLAY
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  // LiveSearch (drawer plein écran mobile)
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Dépôt tout juste ajouté par l’utilisateur (n’est PAS injecté dans dispDeposits)
  const [myDeposit, setMyDeposit] = useState(null);

  // Achievements (reçus après POST) + modal
  const [achievements, setAchievements] = useState([]);
  const [achModalOpen, setAchModalOpen] = useState(false);

  // --- handlers PLAY ---
  const openPlayFor = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };
  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  // --- handler LiveSearch ---
  const openSearch = () => {
    if (myDeposit) return; // un seul dépôt possible
    setIsSearchOpen(true);
  };
  const closeSearch = () => {
    setIsSearchOpen(false);
  };

  // Callback transmis à LiveSearch après POST réussi
  const handleDepositSuccess = (addedDeposit, successes) => {
    // 1) On stocke le dépôt “perso” sans l’injecter dans dispDeposits
    setMyDeposit(addedDeposit || null);

    // 2) Achievements + ouverture de la modale
    setAchievements(Array.isArray(successes) ? successes : []);
    setAchModalOpen(true);
  };

  if (deposits.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Aucun dépôt à afficher.</Typography>
        {/* CTA Déposer si pas de dépôt du tout */}
        {!myDeposit && (
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={openSearch} fullWidth>
              Déposer une chanson
            </Button>
          </Box>
        )}
        {/* Drawer LiveSearch */}
        <Drawer
          anchor="right"
          open={isSearchOpen}
          // onClose ignoré (pas de fermeture sur backdrop/ESC)
          onClose={() => {}}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: "100vw" } }}
        >
          <Box sx={{ p: 2, display: "grid", gap: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <IconButton aria-label="Fermer" onClick={closeSearch}>
                <CloseIcon />
              </IconButton>
            </Box>
            <LiveSearch
              isSpotifyAuthenticated={isSpotifyAuthenticated}
              isDeezerAuthenticated={isDeezerAuthenticated}
              boxName={boxName}
              user={user}
              onDepositSuccess={handleDepositSuccess}
              onClose={closeSearch}
            />
          </Box>
        </Drawer>

        {/* Modal Achievements */}
        <AchievementModal
          open={achModalOpen}
          successes={achievements}
          onClose={() => setAchModalOpen(false)}
          primaryCtaLabel="Revenir à la boîte"
        />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {/* ======= HERO INTRO ======= */}
      <Box
        id="intro"
        sx={{
          width: "100%",
          aspectRatio: "1 / 1.20",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
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
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            t'attend juste en dessous
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
                {/* cover 140x140 */}
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

                {/* infos + Play (si révélé) */}
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

            {/* actions */}
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

        // Après le premier dépôt, on insère:
        // - soit le bloc "my_deposit" (si présent),
        // - soit un CTA "Déposer une chanson".
        if (idx === 0) {
          return (
            <React.Fragment key={`first-frag`}>
              {card}

              {/* Bloc my_deposit OU CTA */}
              {myDeposit ? (
                <Card key={`my-deposit`} sx={{ p: 2, border: "1px dashed #e5e7eb" }}>
                  {/* deposit_date */}
                  <Box id="deposit_date" sx={{ mb: 1, fontSize: 14, color: "text.secondary" }}>
                    {"Ta pépite (à l’instant)"}
                  </Box>

                  {/* deposit_song (layout compact révélé) */}
                  <Box
                    id="deposit_song"
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr",
                      gap: 2,
                      mb: 0,
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
                </Card>
              ) : (
                <Box
                  id="cta_deposit"
                  sx={{
                    width: "100%",
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    p: 2,
                    border: "1px dashed #e5e7eb",
                  }}
                >
                  <Button variant="contained" onClick={openSearch}>
                    Déposer une chanson
                  </Button>
                </Box>
              )}
            </React.Fragment>
          );
        }

        return card;
      })}

      {/* === PLAY MODAL === */}
      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

      {/* === LIVE SEARCH DRAWER (mobile full) === */}
      <Drawer
        anchor="right"
        open={isSearchOpen}
        // pas de fermeture par backdrop/ESC
        onClose={() => {}}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: "100vw" } }}
      >
        <Box sx={{ p: 2, display: "grid", gap: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <IconButton aria-label="Fermer" onClick={closeSearch}>
              <CloseIcon />
            </IconButton>
          </Box>
          <LiveSearch
            isSpotifyAuthenticated={isSpotifyAuthenticated}
            isDeezerAuthenticated={isDeezerAuthenticated}
            boxName={boxName}
            user={user}
            onDepositSuccess={handleDepositSuccess}
            onClose={closeSearch}
          />
        </Box>
      </Drawer>

      {/* === ACHIEVEMENTS MODAL === */}
      <AchievementModal
        open={achModalOpen}
        successes={achievements}
        onClose={() => setAchModalOpen(false)}
        primaryCtaLabel="Revenir à la boîte"
      />
    </Box>
  );
}
