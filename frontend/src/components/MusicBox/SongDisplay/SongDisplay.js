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
  setDispDeposits,
  isSpotifyAuthenticated,
  isDeezerAuthenticated,
  boxName,
  user,
  revealCost,
}) {
  const navigate = useRouterNavigate();
  const { setUser } = useContext(UserContext) || {};

  const cost = typeof revealCost === "number" ? revealCost : 40;

  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [drawerView, setDrawerView] = useState("search");
  const [myDeposit, setMyDeposit] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [snackOpen, setSnackOpen] = useState(false);

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

  const openPlayFor = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };
  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  const openSearch = () => {
    if (myDeposit) return;
    setDrawerView("search");
    setIsSearchOpen(true);
  };
  const closeSearch = () => setIsSearchOpen(false);
  const reopenAchievements = () => {
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

  const handleDepositSuccess = (addedDeposit, successes) => {
    setMyDeposit(addedDeposit || null);
    setAchievements(Array.isArray(successes) ? successes : []);
    setDrawerView("achievements");
    setIsSearchOpen(true);
  };

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
  }, []); 

  const showRevealSnackbar = () => {
    if (snackOpen) {
      setSnackOpen(false);
      setTimeout(() => setSnackOpen(true), 0);
    } else setSnackOpen(true);
  };

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
        if (payload?.error === "insufficient_funds")
          alert("Tu n’as pas assez de crédit pour révéler cette pépite");
        else alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
        return;
      }

      const revealed = payload?.song || {};
      setDispDeposits?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => x?.deposit_id === dep.deposit_id);
        if (idx >= 0) {
          arr[idx] = {
            ...arr[idx],
            discovered_at: "à l'instant",
            song: { ...(arr[idx]?.song || {}), ...revealed },
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

  /* --- Sections MyDeposit --- */
  const MyDepositEmpty = () => (
    <Box sx={{ display: "grid", gap: 1.5, my: "42px" }}>
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
          borderColor: "#888888",
          backgroundColor : "#999999",
          borderRadius: 2,
          display: "grid",
          placeItems: "center",
          p: 1.5,
          aspectRatio: "5 / 2",
        }}
      >
        <Button variant="contained" size="large" onClick={openSearch}>
          Déposer une chanson
        </Button>
      </Box>
    </Box>
  );

  const MyDepositAfter = () => (
    <Box sx={{ display: "grid", gap: 1.5, my: "42px" }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 1 }}>
        Ta chanson est déposée
        <CheckCircleIcon sx={{ color: "success.main" }} fontSize="medium" />
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Typography variant="body1">Révèle d’autres chansons avec les crédits que tu as gagnés.</Typography>
        <Button variant="contained" onClick={reopenAchievements}>+{totalPoints}</Button>
      </Box>
      <Box sx={{ mt: 0.5, border: "1px dashed", borderColor: "divider", borderRadius: 2, p: 1.5 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 2, alignItems: "center" }}>
          <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
            {myDeposit?.song?.img_url && (
              <Box component="img" src={myDeposit.song.img_url} alt={`${myDeposit.song.title} - ${myDeposit.song.artist}`}
                sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            )}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700, textAlign: "left" }}>
              {myDeposit?.song?.title}
            </Typography>
            <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap sx={{ textAlign: "left" }}>
              {myDeposit?.song?.artist}
            </Typography>
            <Button variant="contained" size="large" onClick={() => openPlayFor(myDeposit?.song)} sx={{ alignSelf: "flex-start" }}>
              Play
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  /* --- Rendering --- */
  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {deposits[0] && (
        <Card sx={{ p: 2 }}>
          {/* dépôt idx=0 */}
          <Typography component="h2" variant="h5" sx={{ fontWeight: 700, mb: 2, textAlign: "left" }}>
            La dernière chanson déposée ici
          </Typography>
          <Box sx={{ width: "100%", borderRadius: 1, overflow: "hidden" }}>
            {deposits[0]?.song?.img_url && (
              <Box component="img" src={deposits[0].song.img_url} alt="cover"
                sx={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />
            )}
          </Box>
        </Card>
      )}

      {!myDeposit ? <MyDepositEmpty /> : <MyDepositAfter />}

      {deposits.length > 1 && (
        <Box id="older_deposits" sx={{ mt: "42px" }}>
          <Typography component="h2" variant="h6" sx={{ fontWeight: 700, mb: "8px", textAlign: "left" }}>
            Chansons déposées plus tôt à révéler
          </Typography>
          <Box sx={{ display: "grid", gap: "12px" }}>
            {deposits.slice(1).map((dep, idx) => {
              const s = dep?.song || {};
              const isRevealed = Boolean(s?.title && s?.artist);
              return (
                <Card key={dep.deposit_id ?? idx} sx={{ p: 2 }}>
                  <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                    <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
                      {s?.img_url && (
                        <Box component="img" src={s.img_url} alt="cover"
                          sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, textAlign: "left" }}>
                      {isRevealed && (
                        <>
                          <Typography component="h2" variant="h6" noWrap sx={{ fontWeight: 700 }}>
                            {s.title}
                          </Typography>
                          <Typography component="h3" variant="subtitle1" color="text.secondary" noWrap>
                            {s.artist}
                          </Typography>
                          <Button variant="contained" size="large" onClick={() => openPlayFor(s)} sx={{ alignSelf: "flex-start" }}>
                            Play
                          </Button>
                        </>
                      )}
                      {!isRevealed && (
                        <Button variant="contained" size="large" onClick={() => revealDeposit(dep)}>
                          Découvrir — {cost}
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Card>
              );
            })}
          </Box>
        </Box>
      )}

      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
    </Box>
  );
}
