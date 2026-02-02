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

import Library from "./UserProfile/Library";
import Deposit from "./Common/Deposit";

/* ===========================
   TabPanel (UNMOUNT)
   =========================== */
function TabPanel({ index, value, children }) {
  if (value !== index) return null;
  return (
    <div role="tabpanel" style={{ width: "100%" }}>
      <Box sx={{ pt: 2 }}>{children}</Box>
    </div>
  );
}

/* ===========================
   API helpers
   =========================== */
async function fetchUserInfo(username, signal) {
  if (!username) return { ok: false, status: 400, data: null };

  const url = `/users/get-user-info?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("get-user-info HTTP", res.status, data);
    return { ok: false, status: res.status, data: null };
  }
  return { ok: true, status: res.status, data };
}

async function fetchUserShares(username, { limit, offset }, signal) {
  if (!username) {
    return { ok: false, status: 400, items: [], has_more: false, next_offset: 0 };
  }

  const url = `/box-management/user-deposits?username=${encodeURIComponent(
    username
  )}&limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    signal,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("user-deposits HTTP", res.status, data);
    return { ok: false, status: res.status, items: [], has_more: false, next_offset: offset };
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    ok: true,
    status: res.status,
    items,
    has_more: Boolean(data?.has_more),
    next_offset: typeof data?.next_offset === "number" ? data.next_offset : offset + items.length,
  };
}

/* ===========================
   Page
   =========================== */
export default function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams(); // { username? }
  const { user } = useContext(UserContext) || {};

  const routeUsername = (params?.username || "").trim();
  const targetUsername = routeUsername || (user?.username || "").trim();

  const isOwner =
    !!user && !!targetUsername && targetUsername === (user.username || "").trim();

  // ---- Tabs (owner only) ----
  // tab=0 => Découvertes (Library)
  // tab=1 => Partages
  const [tab, setTab] = useState(0);

  // ---- Header state ----
  const [headerLoading, setHeaderLoading] = useState(true);
  const [headerError, setHeaderError] = useState(null); // "not_found" | "error" | null
  const [headerUser, setHeaderUser] = useState(null); // { username, profile_picture_url, total_deposits }

  // ---- Shares state (Partages) ----
  const [sharesItems, setSharesItems] = useState([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState(null);
  const [sharesHasMore, setSharesHasMore] = useState(false);
  const [sharesNextOffset, setSharesNextOffset] = useState(0);
  const [sharesLoadedOnce, setSharesLoadedOnce] = useState(false);
  const SHARES_LIMIT = 20;

  // Reset & load header when targetUsername changes
  useEffect(() => {
    const controller = new AbortController();

    // reset UI
    setHeaderLoading(true);
    setHeaderError(null);
    setHeaderUser(null);

    setSharesItems([]);
    setSharesLoading(false);
    setSharesError(null);
    setSharesHasMore(false);
    setSharesNextOffset(0);
    setSharesLoadedOnce(false);

    // owner page opens on Library
    if (isOwner) setTab(0);
    else setTab(0); // public page doesn't show tabs anyway

    async function loadHeader() {
      if (!targetUsername) {
        setHeaderLoading(false);
        setHeaderError("error");
        return;
      }

      const { ok, status, data } = await fetchUserInfo(
        targetUsername,
        controller.signal
      );

      if (controller.signal.aborted) return;

      if (!ok) {
        if (status === 404) {
          setHeaderError("not_found");
        } else {
          setHeaderError("error");
        }
        setHeaderUser(null);
        setHeaderLoading(false);
        return;
      }

      setHeaderUser({
        username: data?.username || targetUsername,
        profile_picture_url: data?.profile_picture_url || null,
        total_deposits: typeof data?.total_deposits === "number" ? data.total_deposits : 0,
      });
      setHeaderLoading(false);
    }

    loadHeader();

    return () => controller.abort();
    // IMPORTANT: on dépend de targetUsername + isOwner pour reset tab proprement
  }, [targetUsername, isOwner]);

  // Fetch shares page (append)
  const loadMoreShares = useCallback(async () => {
    if (sharesLoading) return;
    if (!targetUsername) return;
    if (!headerUser && headerLoading) return;

    const controller = new AbortController();
    setSharesLoading(true);
    setSharesError(null);

    try {
      const { ok, status, items, has_more, next_offset } = await fetchUserShares(
        targetUsername,
        { limit: SHARES_LIMIT, offset: sharesNextOffset },
        controller.signal
      );

      if (!ok) {
        setSharesError(status === 404 ? "not_found" : "error");
        setSharesLoading(false);
        setSharesLoadedOnce(true);
        return;
      }

      setSharesItems((prev) => [...prev, ...items]);
      setSharesHasMore(has_more);
      setSharesNextOffset(next_offset);
      setSharesLoadedOnce(true);
      setSharesLoading(false);
    } catch (e) {
      console.error(e);
      setSharesError("error");
      setSharesLoading(false);
      setSharesLoadedOnce(true);
    }

    return () => controller.abort();
  }, [
    sharesLoading,
    targetUsername,
    headerUser,
    headerLoading,
    sharesNextOffset,
  ]);

  // Trigger shares automatically in PUBLIC profile
  useEffect(() => {
    if (isOwner) return; // owner: lazy on tab=1
    if (headerLoading) return;
    if (headerError) return;
    if (sharesLoadedOnce) return;
    // public profile: load shares immediately
    loadMoreShares();
  }, [isOwner, headerLoading, headerError, sharesLoadedOnce, loadMoreShares]);

  // Trigger shares when owner switches to tab=1
  useEffect(() => {
    if (!isOwner) return;
    if (tab !== 1) return;
    if (headerLoading) return;
    if (headerError) return;
    if (sharesLoadedOnce) return;

    loadMoreShares();
  }, [isOwner, tab, headerLoading, headerError, sharesLoadedOnce, loadMoreShares]);

  const profileTitleUsername = headerUser?.username ?? targetUsername ?? "";

  return (
    <Box sx={{ pb: 8 }}>
      {/* Actions */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          m: "0 16px",
          pb: "12px",
        }}
      >
        {isOwner && (
          <IconButton
            aria-label="Réglages"
            onClick={() => navigate("/profile/settings")}
          >
            <SettingsIcon size="medium" />
          </IconButton>
        )}
      </Box>

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, m: "0 16px" }}>
        {headerLoading ? (
          <>
            <Avatar sx={{ width: 64, height: 64, opacity: 0.4 }} />
            <Typography variant="h5" sx={{ flex: 1, opacity: 0.6 }}>
              Chargement…
            </Typography>
          </>
        ) : headerError === "not_found" ? (
          <>
            <Avatar sx={{ width: 64, height: 64 }} />
            <Typography variant="h5" sx={{ flex: 1 }}>
              Profil introuvable
            </Typography>
          </>
        ) : headerError ? (
          <>
            <Avatar sx={{ width: 64, height: 64 }} />
            <Typography variant="h5" sx={{ flex: 1 }}>
              Erreur de chargement du profil
            </Typography>
          </>
        ) : (
          <>
            <Avatar
              src={headerUser?.profile_picture_url || undefined}
              alt={headerUser?.username || ""}
              sx={{ width: 64, height: 64 }}
            />
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5">{headerUser?.username}</Typography>
              <Typography variant="h5" sx={{ color: "text.secondary" }}>
                {`${headerUser?.total_deposits ?? 0} partage${
                  (headerUser?.total_deposits ?? 0) > 1 ? "s" : ""
                }`}
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
        )}
      </Box>

      {/* Owner: tabs */}
      {isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label="Partages" />
          </Tabs>

          {/* Tab 0: Library (mounted only when visible) */}
          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          {/* Tab 1: Partages */}
          <TabPanel value={tab} index={1}>
            {sharesError === "not_found" ? (
              <Typography>Profil introuvable.</Typography>
            ) : sharesError ? (
              <Typography>Erreur lors du chargement des partages.</Typography>
            ) : !sharesLoadedOnce && sharesLoading ? (
              <Typography>Chargement…</Typography>
            ) : !sharesItems.length ? (
              <Typography>Aucun partage pour l’instant.</Typography>
            ) : (
              <Box sx={{ display: "grid", gap: 5, p: 4 }}>
                {sharesItems.map((it, idx) => (
                  <Deposit
                    key={idx}
                    dep={it}
                    user={user}
                    variant="list"
                    fitContainer={true}
                    showUser={false}
                    showReact={false}
                  />
                ))}
              </Box>
            )}

            {/* Bouton Charger plus */}
            <Box sx={{ display: "flex", justifyContent: "center", pb: 6 }}>
              {sharesHasMore ? (
                <Button
                  variant="contained"
                  onClick={loadMoreShares}
                  disabled={sharesLoading}
                >
                  {sharesLoading ? "Chargement…" : "Charger plus"}
                </Button>
              ) : sharesLoadedOnce && sharesItems.length ? (
                <Typography sx={{ color: "text.secondary" }}>
                  Fin des partages
                </Typography>
              ) : null}
            </Box>
          </TabPanel>
        </>
      ) : (
        /* Public: shares only */
        <>
          <Typography variant="h4" sx={{ p: "26px 16px 6px 16px" }}>
            {`Partages de ${profileTitleUsername}`}
          </Typography>

          {sharesError === "not_found" ? (
            <Typography sx={{ p: 2 }}>Profil introuvable.</Typography>
          ) : sharesError ? (
            <Typography sx={{ p: 2 }}>Erreur lors du chargement des partages.</Typography>
          ) : !sharesLoadedOnce && sharesLoading ? (
            <Typography sx={{ p: 2 }}>Chargement…</Typography>
          ) : !sharesItems.length ? (
            <Typography sx={{ p: 2 }}>Aucun partage pour l’instant.</Typography>
          ) : (
            <Box sx={{ display: "grid", gap: 5, p: 4 }}>
              {sharesItems.map((it, idx) => (
                <Deposit
                  key={idx}
                  dep={it}
                  user={user}
                  variant="list"
                  fitContainer={true}
                  showUser={false}
                />
              ))}
            </Box>
          )}

          {/* Bouton Charger plus */}
          <Box sx={{ display: "flex", justifyContent: "center", pb: 6 }}>
            {sharesHasMore ? (
              <Button
                variant="contained"
                onClick={loadMoreShares}
                disabled={sharesLoading}
              >
                {sharesLoading ? "Chargement…" : "Charger plus"}
              </Button>
            ) : sharesLoadedOnce && sharesItems.length ? (
              <Typography sx={{ color: "text.secondary" }}>
                Fin des partages
              </Typography>
            ) : null}
          </Box>
        </>
      )}
    </Box>
  );
}
