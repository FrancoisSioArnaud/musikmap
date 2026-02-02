// frontend/src/components/UserProfilePage.js
import React, { useState, useContext, useEffect, useCallback, useRef } from "react";
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
   Shared UI helpers
   =========================== */
function DepositList({ items, user, showReact }) {
  return (
    <Box sx={{ display: "grid", gap: 5, p: 4 }}>
      {items.map((it) => (
        <Deposit
          key={it?.public_key ?? it?.id ?? JSON.stringify(it)}
          dep={it}
          user={user}
          variant="list"
          fitContainer={true}
          showUser={false}
          showReact={showReact}
        />
      ))}
    </Box>
  );
}

/* ===========================
   Shares section (self-contained)
   =========================== */
function UserSharesSection({ username, user, autoLoad, showReact }) {
  const SHARES_LIMIT = 20;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // "not_found" | "error" | null
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const abortRef = useRef(null);

  const reset = useCallback(() => {
    setItems([]);
    setLoading(false);
    setError(null);
    setHasMore(false);
    setNextOffset(0);
    setLoadedOnce(false);
  }, []);

  // Reset when username changes
  useEffect(() => {
    reset();
    // Abort any in-flight request
    if (abortRef.current) abortRef.current.abort();
  }, [username, reset]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    if (!username) return;

    // Abort previous request if any
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const { ok, status, items: newItems, has_more, next_offset } =
        await fetchUserShares(
          username,
          { limit: SHARES_LIMIT, offset: nextOffset },
          controller.signal
        );

      if (controller.signal.aborted) return;

      if (!ok) {
        setError(status === 404 ? "not_found" : "error");
        setLoading(false);
        setLoadedOnce(true);
        return;
      }

      setItems((prev) => [...prev, ...newItems]);
      setHasMore(has_more);
      setNextOffset(next_offset);
      setLoadedOnce(true);
      setLoading(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error(e);
      setError("error");
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [loading, username, nextOffset]);

  // Auto-load first page (public OR when tab mounts)
  useEffect(() => {
    if (!autoLoad) return;
    if (loadedOnce) return;
    loadMore();
  }, [autoLoad, loadedOnce, loadMore]);

  return (
    <>
      {error === "not_found" ? (
        <Typography sx={{ p: 2 }}>Profil introuvable.</Typography>
      ) : error ? (
        <Typography sx={{ p: 2 }}>Erreur lors du chargement des partages.</Typography>
      ) : !loadedOnce && loading ? (
        <Typography sx={{ p: 2 }}>Chargement…</Typography>
      ) : !items.length ? (
        <Typography sx={{ p: 2 }}>Aucun partage pour l’instant.</Typography>
      ) : (
        <DepositList items={items} user={user} showReact={showReact} />
      )}

      {/* Bouton Charger plus */}
      <Box sx={{ display: "flex", justifyContent: "center", pb: 6 }}>
        {hasMore ? (
          <Button variant="contained" onClick={loadMore} disabled={loading}>
            {loading ? "Chargement…" : "Charger plus"}
          </Button>
        ) : loadedOnce && items.length ? (
          <Typography sx={{ color: "text.secondary" }}>Fin des partages</Typography>
        ) : null}
      </Box>
    </>
  );
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

  const headerAbortRef = useRef(null);

  // Reset tab when target changes (simple rule)
  useEffect(() => {
    setTab(0);
  }, [targetUsername]);

  // Load header when targetUsername changes
  useEffect(() => {
    // Abort previous request
    if (headerAbortRef.current) headerAbortRef.current.abort();
    const controller = new AbortController();
    headerAbortRef.current = controller;

    setHeaderLoading(true);
    setHeaderError(null);
    setHeaderUser(null);

    async function loadHeader() {
      if (!targetUsername) {
        setHeaderLoading(false);
        setHeaderError("error");
        return;
      }

      const { ok, status, data } = await fetchUserInfo(targetUsername, controller.signal);

      if (controller.signal.aborted) return;

      if (!ok) {
        setHeaderError(status === 404 ? "not_found" : "error");
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
  }, [targetUsername]);

  const profileTitleUsername = headerUser?.username ?? targetUsername ?? "";

  function renderHeader() {
    if (headerLoading) {
      return (
        <>
          <Avatar sx={{ width: 64, height: 64, opacity: 0.6 }} />
          <Typography variant="h5" sx={{ flex: 1, opacity: 0.7 }}>
            Chargement…
          </Typography>
        </>
      );
    }

    if (headerError === "not_found") {
      return (
        <>
          <Avatar sx={{ width: 64, height: 64 }} />
          <Typography variant="h5" sx={{ flex: 1 }}>
            Profil introuvable
          </Typography>
        </>
      );
    }

    if (headerError) {
      return (
        <>
          <Avatar sx={{ width: 64, height: 64 }} />
          <Typography variant="h5" sx={{ flex: 1 }}>
            Erreur de chargement du profil
          </Typography>
        </>
      );
    }

    return (
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
          <Button variant="outlined" onClick={() => navigate("/profile/edit")} size="small">
            Modifier
          </Button>
        )}
      </>
    );
  }

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
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon size="medium" />
          </IconButton>
        )}
      </Box>

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, m: "0 16px" }}>
        {renderHeader()}
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

          {/* Tab 1: Partages (mounted only when visible -> autoLoad happens on mount) */}
          <TabPanel value={tab} index={1}>
            {headerError ? (
              <Typography sx={{ p: 2 }}>
                {headerError === "not_found"
                  ? "Profil introuvable."
                  : "Erreur lors du chargement du profil."}
              </Typography>
            ) : headerLoading ? (
              <Typography sx={{ p: 2 }}>Chargement…</Typography>
            ) : (
              <UserSharesSection
                username={targetUsername}
                user={user}
                autoLoad={true}
                showReact={false}
              />
            )}
          </TabPanel>
        </>
      ) : (
        /* Public: shares only */
        <>
          <Typography variant="h4" sx={{ p: "26px 16px 6px 16px" }}>
            {`Partages de ${profileTitleUsername}`}
          </Typography>

          {headerError ? (
            <Typography sx={{ p: 2 }}>
              {headerError === "not_found"
                ? "Profil introuvable."
                : "Erreur lors du chargement du profil."}
            </Typography>
          ) : headerLoading ? (
            <Typography sx={{ p: 2 }}>Chargement…</Typography>
          ) : (
            <UserSharesSection
              username={targetUsername}
              user={user}
              autoLoad={true}
              showReact={false}
            />
          )}
        </>
      )}
    </Box>
  );
}
