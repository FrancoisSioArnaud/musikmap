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

import Library from "./UserProfile/Library";
import Shares from "./UserProfile/Shares";

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

  // Reset tab when target changes
  useEffect(() => {
    setTab(0);
  }, [targetUsername]);

  // Load header when targetUsername changes
  useEffect(() => {
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
          <Typography variant="h5" sx={{ flex: 1, opacity: 0.8 }}>
            Chargement du profil
          </Typography>
        </>
      );
    }

    if (headerError === "not_found") {
      return (
        <>
          <Avatar sx={{ width: 64, height: 64 }} />
          <Typography variant="h5" sx={{ flex: 1 }}>
            Ce profil est introuvable
          </Typography>
        </>
      );
    }

    if (headerError) {
      return (
        <>
          <Avatar sx={{ width: 64, height: 64 }} />
          <Typography variant="h5" sx={{ flex: 1 }}>
            Une erreur s&apos;est produite, veuillez réessayer ulterieurement
          </Typography>
        </>
      );
    }

    // header OK
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

  const headerOk = !headerLoading && !headerError;

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
        {isOwner && headerOk && (
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon size="medium" />
          </IconButton>
        )}
      </Box>

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, m: "0 16px" }}>
        {renderHeader()}
      </Box>

      {/* IMPORTANT: no tabs / no content until header OK */}
      {!headerOk ? null : isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label="Partages" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Shares username={targetUsername} user={user} autoLoad={true} showReact={true} />
          </TabPanel>
        </>
      ) : (
        <>
          <Typography variant="h4" sx={{ p: "26px 16px 6px 16px" }}>
            {`Partages de ${profileTitleUsername}`}
          </Typography>

          <Shares username={targetUsername} user={user} autoLoad={true} showReact={true} />
        </>
      )}
    </Box>
  );
}
