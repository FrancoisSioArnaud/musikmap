import React, { useState, useContext, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { UserContext } from "./UserContext";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import SettingsIcon from "@mui/icons-material/Settings";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Skeleton from "@mui/material/Skeleton";
import PlayModal from "./Common/PlayModal";
import Library from "./UserProfile/Library";

function TabPanel({ index, value, children }) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ width: "100%" }}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

async function fetchPublicUserInfoByUsername(username) {
  const res = await fetch(`/users/get-user-info?username=${encodeURIComponent(username)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`get-user-info HTTP ${res.status}`);
  return res.json(); // { id, username, profile_picture_url, total_deposits, ... }
}

async function fetchUserDeposits(userId) {
  const url = typeof userId === "number"
    ? `/box-management/user-deposits?user_id=${userId}`
    : `/box-management/user-deposits`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  if (!res.ok) throw new Error(`user-deposits HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams();         // { username? }
  const { user } = useContext(UserContext) || {};

  // 1) Détection "owner" vs "public"
  const urlUsername = params?.username?.trim();
  const isOwner = !urlUsername || (user?.username && urlUsername === user.username);

  // 2) Header user (avatar + username) et cible des données
  const [headerLoading, setHeaderLoading] = useState(!isOwner);
  const [headerUser, setHeaderUser] = useState(() => {
    return isOwner
      ? { id: user?.id, username: user?.username, profile_picture_url: user?.profile_picture_url }
      : null;
  });
  const targetUserId = headerUser?.id ?? (isOwner ? user?.id : undefined);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (isOwner) {
        setHeaderLoading(false);
        setHeaderUser({ id: user?.id, username: user?.username, profile_picture_url: user?.profile_picture_url });
        return;
      }
      if (!urlUsername) return;
      setHeaderLoading(true);
      try {
        const info = await fetchPublicUserInfoByUsername(urlUsername);
        if (!cancelled) {
          setHeaderUser({ id: info?.id, username: info?.username, profile_picture_url: info?.profile_picture_url });
        }
      } catch (e) {
        if (!cancelled) setHeaderUser(null);
      } finally {
        if (!cancelled) setHeaderLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlUsername, isOwner, user?.id, user?.username, user?.profile_picture_url]);

  // 3) Dépôts (Partages)
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  const loadDeposits = useCallback(async () => {
    try {
      setDepositsLoading(true);
      const data = await fetchUserDeposits(isOwner ? undefined : headerUser?.id);
      setDeposits(data);
    } catch (e) {
      console.error(e);
      setDeposits([]);
    } finally {
      setDepositsLoading(false);
    }
  }, [isOwner, headerUser?.id]);

  useEffect(() => { if (isOwner || headerUser?.id) loadDeposits(); }, [isOwner, headerUser?.id, loadDeposits]);

  // 4) Play modal
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const openPlayFor = (song) => { setPlaySong(song || null); setPlayOpen(true); };
  const closePlay = () => { setPlayOpen(false); setPlaySong(null); };

  // 5) UI : privé (tabs) vs public (pas de tabs)
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      {/* Bandeau boutons (réglages seulement si owner) */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {isOwner && (
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon />
          </IconButton>
        )}
      </Box>

      {/* Header user */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        {headerLoading ? (
          <>
            <Skeleton variant="circular" width={64} height={64} />
            <Skeleton variant="text" sx={{ flex: 1 }} height={32} />
            {isOwner && <Skeleton variant="rounded" width={160} height={36} />}
          </>
        ) : headerUser ? (
          <>
            <Avatar src={headerUser.profile_picture_url} alt={headerUser.username} sx={{ width: 64, height: 64 }} />
            <Typography variant="h6" sx={{ flex: 1 }}>
              {headerUser.username}
            </Typography>
            {isOwner && (
              <Button
                variant="outlined"
                onClick={() => navigate("/profile/edit")}
                sx={{ textTransform: "none", borderRadius: "20px" }}
              >
                Modifier le profil
              </Button>
            )}
          </>
        ) : (
          <>
            <Avatar sx={{ width: 64, height: 64 }} />
            <Typography variant="h6" sx={{ flex: 1 }}>
              Profil introuvable
            </Typography>
          </>
        )}
      </Box>

      {/* ===== PRIVÉ (owner) : Tabs Découvertes / Partages ===== */}
      {isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label="Partages" />
          </Tabs>

          {/* Tab: Découvertes (privé seulement) */}
          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          {/* Tab: Partages (mes dépôts) */}
          <TabPanel value={tab} index={1}>
            {depositsLoading ? (
              <Box sx={{ display: "grid", gap: 2 }}>
                <Skeleton variant="rounded" height={120} />
                <Skeleton variant="rounded" height={120} />
              </Box>
            ) : !deposits.length ? (
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
        </>
      ) : (
        /* ===== PUBLIC (autre user) : pas de tabs, uniquement Partages ===== */
        <>
          <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
            {`Partages de ${headerUser?.username ?? urlUsername ?? ""}`}
          </Typography>

          {depositsLoading ? (
            <Box sx={{ display: "grid", gap: 2 }}>
              <Skeleton variant="rounded" height={120} />
              <Skeleton variant="rounded" height={120} />
            </Box>
          ) : !deposits.length ? (
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
        </>
      )}
    </Box>
  );
}

