// frontend/src/components/UserProfilePage.js
import React, { useState, useContext, useEffect } from "react";
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

/**
 * Récupère les dépôts d’un user à partir de son username.
 * Retourne un objet { ok, status, deposits }.
 */
async function fetchUserDepositsByUsername(username) {
  if (!username) {
    return { ok: false, status: 400, deposits: [] };
  }

  const url = `/box-management/user-deposits?username=${encodeURIComponent(username)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("user-deposits HTTP", res.status, data);
    return {
      ok: false,
      status: res.status,
      deposits: [],
    };
  }

  return {
    ok: true,
    status: res.status,
    deposits: Array.isArray(data) ? data : [],
  };
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
  const [headerUser, setHeaderUser] = useState(null); // { username, profile_picture }

  // --- 3) Dépôts (Partages) ---
  const [deposits, setDeposits] = useState([]);
  const [depositsLoading, setDepositsLoading] = useState(false);

  // ===========================
  //  Charger directement les dépôts via user-deposits
  //  en utilisant le username dans l'URL (ou le user courant)
  // ===========================
  useEffect(() => {
    let cancelled = false;

    async function loadProfileAndDeposits() {
      // Reset UI avant de relancer un chargement
      setHeaderLoading(true);
      setHeaderUser(null);
      setDeposits([]);
      setDepositsLoading(true);

      // Pas de username résolu -> rien à faire (ex: /profile sans login)
      if (!resolvedUsername) {
        setHeaderLoading(false);
        setDepositsLoading(false);
        return;
      }

      try {
        const { ok, status, deposits: deps } = await fetchUserDepositsByUsername(resolvedUsername);
        if (cancelled) return;

        if (!ok) {
          // Profil introuvable (404) ou autre erreur
          if (status === 404) {
            // headerUser reste null -> "Profil introuvable"
            setHeaderUser(null);
          } else {
            console.error("Erreur lors du chargement des dépôts :", status);
            setHeaderUser(null);
          }
          setHeaderLoading(false);
          setDeposits([]);
          setDepositsLoading(false);
          return;
        }

        // Profil existant (même si aucun dépôt)
        // Pour le header :
        // - Si owner : on essaie d'utiliser les infos du user courant (avatar)
        // - Sinon : on affiche au moins le username, avec avatar générique
        let profilePic = null;
        if (isOwner && user) {
          profilePic =
            user.profile_picture ||
            user.profilePicture ||
            user.profile_pic_url ||
            null;
        }

        setHeaderUser({
          username: resolvedUsername,
          profile_picture: profilePic,
        });

        setDeposits(deps);
        setHeaderLoading(false);
        setDepositsLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setHeaderUser(null);
          setHeaderLoading(false);
          setDeposits([]);
          setDepositsLoading(false);
        }
      }
    }

    loadProfileAndDeposits();
    return () => {
      cancelled = true;
    };
  }, [resolvedUsername, isOwner, user]);

  // --- 4) UI : privé (tabs) vs public (pile simple) ---
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ pb: 8 }}>
      {/* Bandeau actions (réglages uniquement pour owner) */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", m: "0 16px", pb: "12px" }}>
        {isOwner && (
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon size="medium" />
          </IconButton>
        )}
      </Box>

      {/* Header user (avatar + username + total dépôts) */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, m: "0 16px" }}>
        {headerLoading ? (
          <>
            <Skeleton variant="circular" width={64} height={64} />
            <Skeleton variant="text" sx={{ flex: 1 }} height={32} />
            {isOwner && <Skeleton variant="rounded" width={160} height={36} />}
          </>
        ) : headerUser ? (
          <>
            <Avatar
              src={headerUser.profile_picture || undefined}
              alt={headerUser.username}
              sx={{ width: 64, height: 64 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5">{headerUser.username}</Typography>
              <Typography variant="h5" sx={{ color: "text.secondary" }}>
                {`${deposits.length} partage${deposits.length > 1 ? "s" : ""}`}
              </Typography>
            </Box>

            {isOwner && (
              <Button
                variant="outlined"
                onClick={() => navigate("/profile/edit")}
                size="small"
              >
                Modifier
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
              <Box sx={{ display: "grid", gap: 5, p: 4 }}>
                <Skeleton variant="rounded" height={120} />
                <Skeleton variant="rounded" height={120} />
              </Box>
            ) : !deposits.length ? (
              <Typography>Aucun partage pour l’instant.</Typography>
            ) : (
              <Box sx={{ display: "grid", gap: 5, p: 4 }}>
                {deposits.map((it, idx) => (
                  <Deposit
                    key={idx}
                    dep={it}
                    user={user}
                    variant="list"
                    fitContainer={true}
                    showDate={false}
                    showUser={false}
                    showReact={false}
                  />
                ))}
              </Box>
            )}
          </TabPanel>
        </>
      ) : (
        /* ===== PUBLIC (autre user) : pas de tabs, uniquement Partages ===== */
        <>
          <Typography variant="h4" sx={{ p: "26px 16px 6px 16px" }}>
            {`Partages de ${headerUser?.username ?? urlUsername ?? ""}`}
          </Typography>

          {depositsLoading ? (
            <Box sx={{ display: "grid", gap: 5, p: 4 }}>
              <Skeleton variant="rounded" height={120} />
              <Skeleton variant="rounded" height={120} />
            </Box>
          ) : !deposits.length ? (
            <Typography>Aucun partage pour l’instant.</Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 5, p: 4 }}>
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
