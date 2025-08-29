// frontend/src/components/UserProfilePage.js
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

import Library from "./UserProfile/Library";
import Deposit from "./Common/Deposit";

function TabPanel({ index, value, children }) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ width: "100%" }}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

// --- API helpers ---
async function fetchPublicUserInfoByUsername(username) {
  const res = await fetch(`/users/get-user-info?username=${encodeURIComponent(username)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`get-user-info HTTP ${res.status}`);
  return res.json(); // { id, username, profile_picture_url, ... }
}

/**
 * Récupère les dépôts. Si userIdOrNull fourni => ajoute ?user_id.
 * Si usernameOrNull fourni => ajoute ?username (fallback si le back l'accepte).
 * On fera de toute façon un filtre strict côté client ensuite.
 */
async function fetchUserDepositsFor(userIdOrNull, usernameOrNull) {
  const params = new URLSearchParams();
  if (userIdOrNull !== null && userIdOrNull !== undefined && String(userIdOrNull).trim() !== "") {
    params.set("user_id", String(userIdOrNull));
  } else if (usernameOrNull) {
    // au cas où l'API supporte ?username= ; sinon on filtrera côté client
    params.set("username", usernameOrNull);
  }

  const url =
    params.toString().length > 0
      ? `/box-management/user-deposits?${params.toString()}`
      : `/box-management/user-deposits`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`user-deposits HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams(); // { username? }
  const { user } = useContext(UserContext) || {};

  // === 1) Proprio vs public
  const urlUsername = params?.username?.trim();
  const isOwner = !urlUsername || (user?.username && urlUsername === user.username);

  // === 2) Header user (avatar + username)
  const [headerLoading, setHeaderLoading] = useState(!isOwner);
  const [headerUser, setHeaderUser] = useState(() =>
    isOwner
      ? { id: user?.id, username: user?.username, profile_picture_url: user?.profile_picture_url }
      : null
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHeader() {
      if (isOwner) {
        setHeaderLoading(false);
        setHeaderUser({
          id: user?.id,
          username: user?.username,
          profile_picture_url: user?.profile_picture_url,
        });
        return;
      }
      if (!urlUsername) return;
      setHeaderLoading(true);
      try {
        const info = await fetchPublicUserInfoByUsername(urlUsername);
        if (!cancelled) {
          setHeaderUser({
            id: info?.id,
            username: info?.username,
            profile_picture_url: info?.profile_picture_url,
          });
        }
      } catch (e) {
        if (!cancelled) setHeaderUser(null);
      } finally {
        if (!cancelled) setHeaderLoading(false);
      }
    }

    loadHeader();
    return () => {
      cancelled = true;
    };
  }, [isOwner, urlUsername, user?.id, user?.username, user?.profile_picture_url]);

  // === 3) Dépôts (Partages)
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  useEffect(() => {
    setDeposits([]);
  }, [urlUsername, isOwner]);

  const loadDeposits = useCallback(
    async (targetUserIdOrNull, targetUsernameOrNull) => {
      try {
        setDepositsLoading(true);
        const data = await fetchUserDepositsFor(targetUserIdOrNull, targetUsernameOrNull);

        // 🔒 Filtre strict côté client en mode PUBLIC
        // (robuste si l'API ignore le query param ou si le shape des objets varie)
        let filtered = data;
        if (!isOwner) {
          filtered = data.filter((d) => {
            const du = d?.user || {};
            const byId =
              targetUserIdOrNull !== null &&
              targetUserIdOrNull !== undefined &&
              du?.id !== undefined &&
              String(du.id) === String(targetUserIdOrNull);

            const byUsername =
              !!targetUsernameOrNull &&
              ((du?.username && String(du.username) === String(targetUsernameOrNull)) ||
                (du?.name && String(du.name) === String(targetUsernameOrNull)));

            return byId || byUsername;
          });
        }

        setDeposits(filtered);
      } catch (e) {
        console.error(e);
        setDeposits([]);
      } finally {
        setDepositsLoading(false);
      }
    },
    [isOwner]
  );

  // Charge la bonne liste
  useEffect(() => {
    if (isOwner) {
      loadDeposits(null, null);
    } else if (headerUser?.id !== undefined && headerUser?.id !== null) {
      loadDeposits(headerUser.id, headerUser.username);
    }
  }, [isOwner, headerUser?.id, headerUser?.username, loadDeposits]);

  // === 4) UI : privé (tabs) vs public (pas de tabs)
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      {/* Bouton réglages (owner only) */}
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

      {/* ===== PRIVÉ (owner) ===== */}
      {isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label="Partages" />
          </Tabs>

          {/* Tab: Découvertes */}
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
                {deposits.map((it, idx) => (
                  <Deposit
                    key={idx}
                    dep={it}
                    user={user}
                    variant="list"
                    fitContainer={true}
                    showDate={false}
                    showUser={false}
                  />
                ))}
              </Box>
            )}
          </TabPanel>
        </>
      ) : (
        /* ===== PUBLIC (autre user) : uniquement Partages ===== */
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
              {deposits.map((it, idx) => (
                <Deposit
                  key={idx}
                  dep={it}
                  user={user}
                  variant="list"
                  fitContainer={true}
                  showDate={false}
                  showUser={false}
                />
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
