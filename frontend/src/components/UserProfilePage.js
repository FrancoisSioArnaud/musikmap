// frontend/src/components/UserProfilePage.js
import React, { useState, useContext, useEffect, useRef } from "react";
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
import CircularProgress from "@mui/material/CircularProgress";

import Library from "./UserProfile/Library";
import Shares from "./UserProfile/Shares";

/* ===========================
   TabPanel (UNMOUNT)
   =========================== */
function TabPanel({ index, value, children }) {
  if (value !== index) return null;
  return (
    <div role="tabpanel" style={{ width: "100%" }}>
      <Box> {children}</Box>
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

  // tab=0 => Découvertes (Library)
  // tab=1 => Partages
  const [tab, setTab] = useState(0);

  // Header status machine
  // status: "loading" | "ready" | "not_found" | "error"
  const [header, setHeader] = useState({
    status: "loading",
    user: null,
  });

  const headerAbortRef = useRef(null);

  // Reset tab on profile change
  useEffect(() => {
    setTab(0);
  }, [targetUsername]);

  // Load header
  useEffect(() => {
    if (headerAbortRef.current) headerAbortRef.current.abort();
    const controller = new AbortController();
    headerAbortRef.current = controller;

    setHeader({ status: "loading", user: null });

    async function load() {
      if (!targetUsername) {
        setHeader({ status: "error", user: null });
        return;
      }

      const { ok, status, data } = await fetchUserInfo(targetUsername, controller.signal);
      if (controller.signal.aborted) return;

      if (!ok) {
        setHeader({ status: status === 404 ? "not_found" : "error", user: null });
        return;
      }

      setHeader({
        status: "ready",
        user: {
          username: data?.username || targetUsername,
          profile_picture_url: data?.profile_picture_url || null,
          total_deposits: typeof data?.total_deposits === "number" ? data.total_deposits : 0,
        },
      });
    }

    load();
    return () => controller.abort();
  }, [targetUsername]);

  // States derived from header
  const headerReady = header.status === "ready";
  const headerUser = header.user;

  const totalDeposits = headerUser?.total_deposits ?? 0;
  const depositsLabel = `${totalDeposits} partage${totalDeposits > 1 ? "s" : ""}`;

  // Messages (strictly as requested)
  if (header.status === "loading") {
    return (
      <Box sx={{ pb: 8 }}>
        {/* Loader centré */}
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (header.status === "not_found") {
    return (
      <Box sx={{ pb: 8, p: 2 }}>
        <Typography>Ce profil est introuvable</Typography>
      </Box>
    );
  }

  if (header.status === "error") {
    return (
      <Box sx={{ pb: 8, p: 2 }}>
        <Typography>Une erreur s&apos;est produite, veuillez réessayer ulterieurement</Typography>
      </Box>
    );
  }

  // From here: headerReady === true
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
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon size="medium" />
          </IconButton>
        )}
      </Box>

      {/* Header */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "vertical",
          alignItems: "center",
          gap: 4,
          p: "38px 16px",
        }}
      >
        <Avatar
          src={headerUser?.profile_picture_url || undefined}
          alt={headerUser?.username || ""}
          sx={{ width: 64, height: 64 }}
        />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h2">{headerUser?.username}</Typography>
        </Box>

        {isOwner && (
          <Button variant="outlined" onClick={() => navigate("/profile/edit")} size="small">
            Modifier
          </Button>
        )}
      </Box>

      {/* Content only when header is ready */}
      {headerReady && isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label={depositsLabel} />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          <TabPanel value={tab} index={1}>
            {/* Lazy-load: component mounts only when tab is visible */}
            <Shares username={targetUsername} user={user} autoLoad={true} />
          </TabPanel>
        </>
      ) : (
        <>
          {/* Public: shares only (mounted only after header ready) */}
          <Typography variant="h5" sx={{ p: "26px 16px 6px 16px" }}>
            {depositsLabel}
          </Typography>
          <Shares username={targetUsername} user={user} autoLoad={true} />
        </>
      )}
    </Box>
  );
}


