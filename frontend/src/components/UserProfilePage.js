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
  return res.json(); // { id, username, profile_picture_url, total_deposits, ... }
}

/** Récupère les dépôts d’un user. Exige un userId non nul. */
async function fetchUserDepositsFor(userId) {
  if (userId == null) return [];
  const url = `/box-management/user-deposits?user_id=${encodeURIComponent(userId)}`;

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

  // --- 1) Détection propriétaire vs public ---
  const urlUsername = (params?.username || "").trim();
  const isOwner = !urlUsername || (user?.username && urlUsername === user.username);

  // Username cible à résoudre (public => param route, privé => username du contexte)
  const resolvedUsername = urlUsername || user?.username || "";

  // --- 2) Header (avatar + username affiché) ---
  const [headerLoading, setHeaderLoading] = useState(true);
  const [headerUser, setHeaderUser] = useState(null); // { id, username, profile_picture_url }

  // --- 3) Dépôts (Partages) ---
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  const loadDeposits = useCallback(async (targetUserId) => {
    setDepositsLoading(true);
    try {
      const data = await fetchUserDepositsFor(targetUserId);
      setDeposits(data);
    } catch (e) {
      console.error(e);
      setDeposits([]);
    } finally {
      setDepositsLoading(false);
    }
  }, []);

  // ===========================
  //  Résoudre l'ID via get-user-info AVANT de charger les dépôts
  // ===========================
  useEffect(() => {
    let cancelled = false;

    async function resolveThenLoad() {
      // Reset UI avant de relancer une résolution
      setHeaderLoading(true);
      setHeaderUser(null);
      setDeposits([]);
      setDepositsLoading(false);

      // Pas de username -> rien à faire (ex: /profile sans login)
      if (!resolvedUsername) {
        setHeaderLoading(false);
        return;
      }

      try {
        const info = await fetchPublicUserInfoByUsername(resolvedUsername); // null si 404
        if (cancelled) return;

        if (!info) {
          // Profil introuvable
          setHeaderUser(null);
          setHeaderLoading(false);
          setDeposits([]);
          return;
        }

        // On a bien résolu l'utilisateur (public ou owner)
        const hdr = {
          id: info?.id,
          username: info?.username,
          profile_picture_url: info?.profile_picture_url,
        };
        setHeaderUser(hdr);
        setHeaderLoading(false);

        // Charger les dépôts UNIQUEMENT quand l'id est connu
        if (hdr.id != null) {
          await loadDeposits(hdr.id);
        } else {
          setDeposits([]);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setHeaderUser(null);
          setHeaderLoading(false);
          setDeposits([]);
        }
      }
    }

    resolveThenLoad();
    return () => {
      cancelled = true;
    };
  }, [resolvedUsername, loadDeposits]);

  // --- 4) UI : privé (tabs) vs public (pile simple) ---
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ pb: 8 }}>
      {/* Bandeau actions (réglages uniquement pour owner) */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end" , m: "0 16px"}}>
        {isOwner && (
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon size="medium"/>
          </IconButton>
        )}
      </Box>

      {/* Header user (avatar + username) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, m: "0 16px"}}>
        {headerLoading ? (
          <>
            <Skeleton variant="circular" width={64} height={64} />
            <Skeleton variant="text" sx={{ flex: 1 }} height={32} />
            {isOwner && <Skeleton variant="rounded" width={160} height={36} />}
          </>
        ) : headerUser ? (
          <>
            <Avatar src={headerUser.profile_picture_url} alt={headerUser.username} sx={{ width: 64, height: 64 }} />
            <Typography variant="h5" sx={{ flex: 1 }}>
              {headerUser.username}
            </Typography>
            {isOwner && (
              <Button
                variant="outlined"
                onClick={() => navigate("/profile/edit")}
                size="small"
              >
                Modifier le profil
              </Button>
            )}
          </>
        ) : (
          <>
            <Avatar sx={{ width: 64, height: 64 }} />
            <Typography variant="h5" sx={{ flex: 1 }}>
              Profil introuvable
            </Typography>
          </>
        )}
      </Box>

      {/* ===== PRIVÉ (owner) : Tabs Découvertes / Partages ===== */}
      {isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" variant="h6" />
            <Tab label="Partages" variant="h6" />
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



