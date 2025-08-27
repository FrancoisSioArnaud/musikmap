// frontend/src/components/OnBoarding/SongDisplay.js
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

/* === NEW: Snackbar + Slide + Content + Icon === */
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
  const deposits = useMemo(
    () => (Array.isArray(dispDeposits) ? dispDeposits : []),
    [dispDeposits]
  );

  // === ÉTATS LOCAUX ===
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

  // auto log du main
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
        alert(payload?.error === "insufficient_funds"
          ? "Tu n’as pas assez de crédit pour révéler cette pépite"
          : "Oops une erreur s’est produite.");
        return;
      }
      const revealed = payload?.song || {};
      setDispDeposits?.((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const idx = arr.findIndex((x) => x?.deposit_id === dep.deposit_id);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], song: { ...(arr[idx]?.song || {}), ...revealed } };
        }
        return arr;
      });
      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((p) => ({ ...(p || {}), points: payload.points_balance }));
      }
      showRevealSnackbar();
    } catch {}
  };

  const MyDepositCard = () => (
    <Card sx={{ p: 2, border: "1px dashed #e5e7eb" }}>
      <Typography component="h1" variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        Ta chanson est déposée ✅
      </Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 2, mb: 1 }}>
        <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
          {myDeposit?.song?.img_url && (
            <Box
              component="img"
              src={myDeposit.song.img_url}
              alt={`${myDeposit.song.title} - ${myDeposit.song.artist}`}
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="h6" noWrap>{myDeposit?.song?.title}</Typography>
          <Typography variant="subtitle1" color="text.secondary" noWrap>
            {myDeposit?.song?.artist}
          </Typography>
          <Button variant="contained" onClick={() => openPlayFor(myDeposit.song)}>Play</Button>
        </Box>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1 }}>
        <Typography variant="body2">
          Révèle d’autres chansons avec les crédits que tu as gagné
        </Typography>
        <Box role="button" onClick={reopenAchievements}
          sx={{ px: 2, py: 1, borderRadius: 1.5, fontWeight: 700, bgcolor: "primary.main", color: "primary.contrastText" }}>
          +{totalPoints}
        </Box>
      </Box>
    </Card>
  );

  return (
    <Box sx={{ display: "grid", gap: 2, p: 2 }}>
      {/* Section MyDeposit */}
      <Box sx={{ my: "42px" }}>
        {!myDeposit ? (
          <Card sx={{ p: 2, border: "1px dashed #e5e7eb", aspectRatio: "5 / 2", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Button variant="contained" onClick={openSearch}>Déposer une chanson</Button>
          </Card>
        ) : (
          <MyDepositCard />
        )}
      </Box>

      {/* Dépôts principaux (0..9) */}
      {deposits.slice(0, 10).map((dep, idx) => (
        <Card key={idx} sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
            Pépite déposée {dep?.deposit_date || ""}
          </Typography>
          <Typography variant="h6">{dep.song?.title}</Typography>
          <Typography variant="subtitle1" color="text.secondary">{dep.song?.artist}</Typography>
          <Button variant="contained" onClick={() => openPlayFor(dep.song)}>Play</Button>
        </Card>
      ))}

      {/* Section dépôts anciens */}
      {deposits.length > 10 && (
        <Box sx={{ mt: 4 }}>
          <Typography component="h2" variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            Révèle d&apos;autres chansons déposées plus tôt
          </Typography>
          <Box sx={{ display: "grid", gap: 2 }}>
            {deposits.slice(10).map((dep, idx) => (
              <Card key={`old-${idx}`} sx={{ p: 2 }}>
                <Typography variant="h6">{dep.song?.title}</Typography>
                <Typography variant="subtitle1" color="text.secondary">{dep.song?.artist}</Typography>
                <Button variant="contained" onClick={() => openPlayFor(dep.song)}>Play</Button>
              </Card>
            ))}
          </Box>
        </Box>
      )}

      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
    </Box>
  );
}
