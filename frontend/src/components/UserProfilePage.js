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

function TabPanel({ index, value, children }) {
  if (value !== index) return null;
  return (
    <div role="tabpanel" style={{ width: "100%" }}>
      <Box>{children}</Box>
    </div>
  );
}

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
    return { ok: false, status: res.status, data: null };
  }
  return { ok: true, status: res.status, data };
}

export default function UserProfilePage() {
  const navigate = useNavigate();
  const params = useParams();
  const { user } = useContext(UserContext) || {};

  const routeUsername = (params?.username || "").trim();
  const isOwner = !routeUsername && Boolean(user?.id);
  const isGuestOwner = Boolean(isOwner && user?.is_guest);

  const [tab, setTab] = useState(0);
  const [header, setHeader] = useState({
    status: "loading",
    user: null,
  });
  const headerAbortRef = useRef(null);

  useEffect(() => {
    setTab(0);
  }, [routeUsername, user?.id]);

  useEffect(() => {
    if (headerAbortRef.current) headerAbortRef.current.abort();
    const controller = new AbortController();
    headerAbortRef.current = controller;

    setHeader({ status: "loading", user: null });

    async function load() {
      if (isOwner && user?.id) {
        setHeader({
          status: "ready",
          user: {
            username: user?.is_guest ? null : user?.username || null,
            display_name: user?.display_name || user?.username || "Invité",
            profile_picture_url: user?.profile_picture_url || null,
            total_deposits: null,
            is_guest: Boolean(user?.is_guest),
          },
        });
        return;
      }

      if (!routeUsername) {
        setHeader({ status: "error", user: null });
        return;
      }

      const { ok, status, data } = await fetchUserInfo(routeUsername, controller.signal);
      if (controller.signal.aborted) return;

      if (!ok) {
        setHeader({ status: status === 404 ? "not_found" : "error", user: null });
        return;
      }

      setHeader({
        status: "ready",
        user: {
          username: data?.username || routeUsername,
          display_name: data?.display_name || data?.username || routeUsername,
          profile_picture_url: data?.profile_picture_url || null,
          total_deposits: typeof data?.total_deposits === "number" ? data.total_deposits : 0,
          is_guest: false,
        },
      });
    }

    load();
    return () => controller.abort();
  }, [routeUsername, isOwner, user]);

  if (header.status === "loading") {
    return (
      <Box sx={{ pb: 8 }}>
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

  const headerUser = header.user || {};
  const totalDeposits = headerUser?.total_deposits ?? 0;
  const depositsLabel =
    isOwner && headerUser?.total_deposits == null
      ? "Partages"
      : `${totalDeposits} partage${totalDeposits > 1 ? "s" : ""}`;

  return (
    <Box>
      {isOwner && !isGuestOwner && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            m: "0 16px",
            pb: "12px",
          }}
        >  
          <IconButton aria-label="Réglages" onClick={() => navigate("/profile/settings")}>
            <SettingsIcon size="large" />
          </IconButton>
        </Box>
      )}

      <Box
        sx={{
          display: "flex",
          flexDirection: "vertical",
          alignItems: "center",
          gap: 4,
          p: "38px 16px",
        }}
      >
        <Box>
          <Avatar
            src={headerUser?.profile_picture_url || undefined}
            alt={headerUser?.display_name || ""}
            sx={{ width: 64, height: 64 }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h2">{headerUser?.display_name}</Typography>
          </Box>
        </Box>

        {isOwner && !isGuestOwner && (
          <Button variant="outlined" onClick={() => navigate("/profile/edit")} size="small">
            Modifier
          </Button>
        )}

        {isGuestOwner && (
          <Button variant="contained" onClick={() => navigate("/register")} size="small">
            Finaliser mon compte
          </Button>
        )}
      </Box>

      {isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label={depositsLabel} />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Shares me={true} user={user} autoLoad={true} />
          </TabPanel>
        </>
      ) : (
        <>
          <Typography variant="h5" sx={{ p: "26px 16px 6px 16px" }}>
            {depositsLabel}
          </Typography>
          <Shares username={routeUsername} me={false} user={user} autoLoad={true} />
        </>
      )}
    </Box>
  );
}
