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
/** Réutilisation du composant Deposit pour la section Partages */
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
 * Récupère les dépôts d'un user.
 * - Si owner: sans filtre (l'API renvoie mes dépôts)
 * - Si public: on envoie TANT QUE POSSIBLE user_id ET/OU username pour couvrir les 2 cas backend
 */
async function fetchUserDepositsFor({ userId, username } = {}) {
  const qs = new URLSearchParams();
  if (userId !== undefined && userId !== null && String(userId).trim() !== "") {
    qs.set("user_id", String(userId));
  }
  if (username && String(username).trim() !== "") {
    qs.set("username", String(username).trim());
  }
  const url = `/box-management/user-deposits${qs.toString() ? `?${qs.toString()}` : ""}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("user-deposits HTTP", res.status, data);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams(); // { username? }
  const { user } = useContext(UserContext) || {};

  // === 1) Détection propriétaire vs public (par username)
  const urlUsername = (params?.username || "").trim();
  const isOwner = !urlUsername || (user?.username && urlUsername === user.username);

  // === 2) Header user (avatar + username affiché)
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

  // === 3) Dépôts (Partages) — privé ou public
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  // Reset à chaque changement de username (évite l'affichage transitoire d'un autre profil)
  useEffect(() => {
    setDeposits([]);
  }, [urlUsername, isOwner]);

  const loadDeposits = useCallback(
    async ({ userId, username } = {}) => {
      try {
        setDepositsLoading(true);
        const data = await fetchUserDepositsFor({ userId, username });
        setDeposits(data);
      } catch (e) {
        console.error(e);
        setDeposits([]);
      } finally {
        setDepositsLoading(false);
      }
    },
    []
  );

  // Privé: pas de param → API renvoie mes dépôts
  // Public: on envoie username tout de suite, puis (quand dispo) user_id — l'API prendra ce qu'elle comprend
  useEffect(() => {
    if (isOwner) {
      loadDeposits({});
    } else {
      if (urlUsername) {
        loadDeposits({ username: urlUsername });
      }
      if (headerUser?.id !== undefined && headerUser?.id !== null) {
        loadDeposits({ userId: headerUser.id, username: urlUsername });
      }
    }
  }, [isOwner, urlUsername, headerUser?.id, loadDeposits]);

  // === 4) UI : privé (tabs) vs public (pas de tabs)
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
                {deposits.map((it, idx) => (
                  <Deposit
                    key={idx}
                    dep={it}
                    user={user}
                    variant="list"
                    fitContainer={true}
                    showDate={false}
                    showUser={false} // header déjà en haut de la page profil
                  />
                ))}
              </Box>
            )}
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
              {deposits.map((it, idx) => (
                <Deposit
                  key={idx}
                  dep={it}
                  user={user}
                  variant="list"
                  fitContainer={true}
                  showDate={false}
                  showUser={false} // header déjà visible au-dessus
                />
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
