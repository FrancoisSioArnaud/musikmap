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
/** Réutilisation du composant factorisé */
import Deposit from "./Common/Deposit";

function TabPanel({ index, value, children }) {
  return (
    <div role="tabpanel" hidden={value !== index} style={{ width: "100%" }}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

/* ===========================
   API helpers
   =========================== */

/** Résout un username en infos publiques (id, username, avatar). Retourne null si 404. */
async function fetchPublicUserInfoByUsername(username) {
  const res = await fetch(`/users/get-user-info?username=${encodeURIComponent(username)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get-user-info HTTP ${res.status}`);
  return res.json();
}

/** Récupère les dépôts d’un user. Si userId est défini → filtre strict côté backend. */
async function fetchUserDepositsFor(userId) {
  const url =
    userId != null
      ? `/box-management/user-deposits?user_id=${encodeURIComponent(userId)}`
      : `/box-management/user-deposits`;

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

/* ===========================
   Page
   =========================== */

export default function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams(); // { username? }
  const { user } = useContext(UserContext) || {};

  // --- 1) Propriétaire vs public ---
  const urlUsername = (params?.username || "").trim();
  const isOwner = !urlUsername || (user?.username && urlUsername === user.username);

  // --- 2) Header (avatar + username affiché) ---
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
        // Profil propriétaire : on s'appuie sur le UserContext
        setHeaderLoading(false);
        setHeaderUser({
          id: user?.id,
          username: user?.username,
          profile_picture_url: user?.profile_picture_url,
        });
        return;
      }

      // Profil public : résoudre via get-user-info
      if (!urlUsername) return;

      setHeaderLoading(true);
      try {
        const info = await fetchPublicUserInfoByUsername(urlUsername); // null si 404
        if (!cancelled) {
          setHeaderUser(
            info
              ? {
                  id: info?.id,
                  username: info?.username,
                  profile_picture_url: info?.profile_picture_url,
                }
              : null
          );
        }
      } catch {
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

  // --- 3) Dépôts (Partages) ---
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  // Reset quand on change de profil
  useEffect(() => {
    setDeposits([]);
  }, [urlUsername, isOwner]);

  const loadDeposits = useCallback(async (targetUserIdOrNull) => {
    try {
      setDepositsLoading(true);
      const data = await fetchUserDepositsFor(targetUserIdOrNull);
      setDeposits(data);
    } catch (e) {
      console.error(e);
      setDeposits([]);
    } finally {
      setDepositsLoading(false);
    }
  }, []);

  // Privé (owner) : pas de param → mes dépôts
  useEffect(() => {
    if (isOwner) {
      loadDeposits(null);
    }
  }, [isOwner, loadDeposits]);

  // Public : NE CHARGER que si headerUser !== null ET headerUser.username défini
  //          -> on passe STRICTEMENT l'id à l'API pour filtrer
  useEffect(() => {
    if (!isOwner) {
      if (headerUser != null && typeof headerUser?.username !== "undefined") {
        // On a bien résolu le user public -> on filtre par son ID
        loadDeposits(headerUser.id);
      } else {
        // Sinon, ne rien charger (évite de tomber sur "tous les dépôts")
        setDeposits([]);
      }
    }
  }, [isOwner, headerUser, loadDeposits]);

  // --- 4) UI : privé (tabs) vs public (pile simple) ---
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      {/* Bandeau actions (réglages uniquement pour owner) */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {isOwner && (
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon />
          </IconButton>
        )}
      </Box>

      {/* Header user (avatar + username) */}
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

          {/* Onglet Découvertes */}
          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          {/* Onglet Partages (mes dépôts) */}
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
                    showUser={false} // éviter la redondance: header déjà affiché en haut
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
                  showUser={false} // header déjà affiché au-dessus
                />
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
