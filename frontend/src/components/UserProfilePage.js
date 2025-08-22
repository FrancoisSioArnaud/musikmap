// frontend/src/components/UserProfilePage.js
import React, { useState, useContext, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "./UserContext";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import SettingsIcon from "@mui/icons-material/Settings";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import PlayModal from "./Common/PlayModal";
import LibraryPage from "./LibraryPage";

function TabPanel({ index, value, children }) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ width: "100%" }}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [tab, setTab] = useState(0);

  // ---- My Deposits (Partages)
  const [deposits, setDeposits] = useState([]);
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);

  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

  const loadDeposits = useCallback(async () => {
    try {
      const res = await fetch("/box-management/user-deposits");
      const data = await res.json();
      setDeposits(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setDeposits([]);
    }
  }, []);

  useEffect(() => { loadDeposits(); }, [loadDeposits]);

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      {/* Bandeau + bouton réglages à droite */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
          <SettingsIcon />
        </IconButton>
      </Box>

      {/* user_info */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Avatar src={user.profile_picture_url} alt={user.username} sx={{ width: 64, height: 64 }} />
        <Typography variant="h6" sx={{ flex: 1 }}>{user.username}</Typography>
        <Button
          variant="outlined"
          onClick={() => navigate("/profile/edit")}
          sx={{ textTransform: "none", borderRadius: "20px" }}
        >
          Modifier le profil
        </Button>
      </Box>

      {/* Tabs full width */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        <Tab label="Découvertes" />
        <Tab label="Partages" />
      </Tabs>

      {/* Tab: Découvertes (rend LibraryPage sans le titre) */}
      <TabPanel value={tab} index={0}>
        <LibraryPage hideTitle />
      </TabPanel>

      {/* Tab: Partages (mes dépôts) */}
      <TabPanel value={tab} index={1}>
        {!deposits.length ? (
          <Typography>Aucun partage pour l’instant.</Typography>
        ) : (
          <Box sx={{ display: "grid", gap: 2 }}>
            {deposits.map((it, idx) => {
              const s = it?.song || {};
              return (
                <Box
                  key={idx}
                  sx={{ p: 2, border: "1px solid #e5e7eb", borderRadius: 2, background: "#fff" }}
                >
                  {/* Layout REVEALED (sans deposit_user) */}
                  <Box sx={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 2, alignItems: "center" }}>
                    <Box sx={{ width: 140, height: 140, borderRadius: 1, overflow: "hidden" }}>
                      {s?.img_url && (
                        <Box
                          component="img"
                          src={s.img_url}
                          alt={`${s.title ?? ""} - ${s.artist ?? ""}`}
                          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      )}
                    </Box>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
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
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}

        {/* Modale Play */}
        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
      </TabPanel>
    </Box>
  );
}
