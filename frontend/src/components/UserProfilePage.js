import EditIcon from "@mui/icons-material/Edit";
import SettingsIcon from "@mui/icons-material/Settings";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getCookie } from "./Security/TokensUtils";
import React, { useState, useContext, useEffect, useRef } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

import { startAuthPageFlow } from "./Auth/AuthFlow";
import { UserContext } from "./UserContext";
import FavoriteSongSection from "./UserProfile/FavoriteSongSection";
import FollowButton from "./UserProfile/FollowButton";
import ProfileFollowDrawer from "./UserProfile/ProfileFollowDrawer";
import Library from "./UserProfile/Library";
import Shares from "./UserProfile/Shares";
import {
  closeDrawerWithHistory,
  matchesDrawerSearch,
  openDrawerWithHistory,
} from "./Utils/drawerHistory";
import {
  getProfilePageStateKey,
  readPageState,
  saveProfileTabState,
} from "./Utils/pageStateStorage";

function TabPanel({ index, value, children }) {
  if (value !== index) {return null;}
  return (
    <div role="tabpanel" style={{ width: "100%" }}>
      <Box>{children}</Box>
    </div>
  );
}

async function fetchUserInfo(username, signal) {
  if (!username) {return { ok: false, status: 400, data: null };}

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
  const location = useLocation();
  const params = useParams();
  const { user } = useContext(UserContext) || {};

  const routeUsername = (params?.username || "").trim();
  const normalizedRouteUsername = routeUsername.toLowerCase();
  const currentUsername = (user?.username || "").trim();
  const normalizedCurrentUsername = currentUsername.toLowerCase();
  const shouldCanonicalRedirect = Boolean(
    routeUsername &&
      currentUsername &&
      normalizedRouteUsername === normalizedCurrentUsername
  );
  const profilePathname = shouldCanonicalRedirect
    ? "/profile"
    : routeUsername
      ? `/profile/${routeUsername}`
      : "/profile";
  const pageStateKey = getProfilePageStateKey({ pathname: profilePathname, search: "" });
  const isOwner = !routeUsername && Boolean(user?.id);
  const isGuestOwner = Boolean(isOwner && user?.is_guest);

  const initialProfileState = readPageState(pageStateKey);
  const [tab, setTab] = useState(
    typeof initialProfileState?.tab === "number" ? initialProfileState.tab : 0
  );
  const [guestUsernameDraft, setGuestUsernameDraft] = useState("");
  const [header, setHeader] = useState({
    status: "loading",
    user: null,
  });
  const [chatState, setChatState] = useState({ state: "", thread_id: null, allow_private_message_requests: true });
  const [followBusy, setFollowBusy] = useState(false);
  const [followDrawerMode, setFollowDrawerMode] = useState(null);
  const [followDrawerLoading, setFollowDrawerLoading] = useState(false);
  const [followDrawerError, setFollowDrawerError] = useState("");
  const [followDrawerItems, setFollowDrawerItems] = useState([]);
  const headerAbortRef = useRef(null);

  useEffect(() => {
    const savedState = readPageState(pageStateKey);
    setTab(typeof savedState?.tab === "number" ? savedState.tab : 0);
  }, [pageStateKey]);

  useEffect(() => {
    setGuestUsernameDraft("");
  }, [user?.id]);

  useEffect(() => {
    saveProfileTabState(pageStateKey, tab);
  }, [pageStateKey, tab]);

  useEffect(() => {
    if (headerAbortRef.current) {headerAbortRef.current.abort();}
    const controller = new AbortController();
    headerAbortRef.current = controller;

    if (isOwner && user?.id) {
      setHeader({
        status: "ready",
        user: {
          id: user?.id || null,
          username: user?.is_guest ? null : user?.username || null,
          display_name: user?.display_name || user?.username || "Invité",
          profile_picture_url: user?.profile_picture_url || null,
          total_deposits:
            typeof user?.total_deposits === "number" ? user.total_deposits : 0,
          status: user?.status || null,
          is_guest: Boolean(user?.is_guest),
          favorite_deposit: user?.favorite_deposit || null,
          followers_count: typeof user?.followers_count === "number" ? user.followers_count : 0,
          following_count: typeof user?.following_count === "number" ? user.following_count : 0,
          is_followed_by_me: false,
        },
      });
      return () => controller.abort();
    }

    setHeader({ status: "loading", user: null });

    async function load() {
      if (!routeUsername) {
        setHeader({ status: "error", user: null });
        return;
      }

      const { ok, status, data } = await fetchUserInfo(
        routeUsername,
        controller.signal
      );
      if (controller.signal.aborted) {return;}

      if (!ok) {
        setHeader({
          status: status === 404 ? "not_found" : "error",
          user: null,
        });
        return;
      }

      setHeader({
        status: "ready",
        user: {
          id: data?.id || null,
          username: data?.username || routeUsername,
          display_name: data?.display_name || data?.username || routeUsername,
          profile_picture_url: data?.profile_picture_url || null,
          total_deposits:
            typeof data?.total_deposits === "number" ? data.total_deposits : 0,
          status: data?.status || null,
          is_guest: false,
          favorite_deposit: data?.favorite_deposit || null,
          followers_count: typeof data?.followers_count === "number" ? data.followers_count : 0,
          following_count: typeof data?.following_count === "number" ? data.following_count : 0,
          is_followed_by_me: Boolean(data?.is_followed_by_me),
        },
      });
    }

    load();
    return () => controller.abort();
  }, [
    routeUsername,
    isOwner,
    user?.id,
    user?.username,
    user?.display_name,
    user?.profile_picture_url,
    user?.is_guest,
    user?.status?.name,
    user?.status?.min_deposits,
    user?.total_deposits,
    user?.favorite_deposit?.public_key,
  ]);

  useEffect(() => {
    if (!user?.id || isOwner || !routeUsername) {return;}
    let ignore = false;
    fetch(`/messages/status/${encodeURIComponent(routeUsername)}`, { credentials: "same-origin" })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (ignore) {return;}
        if (!ok) {
          setChatState({ state: "", thread_id: null, allow_private_message_requests: true });
          return;
        }
        setChatState({
          state: data?.state || "",
          thread_id: data?.thread_id || null,
          allow_private_message_requests: Boolean(data?.allow_private_message_requests),
        });
      })
      .catch(() => {
        if (!ignore) {
          setChatState({ state: "", thread_id: null, allow_private_message_requests: true });
        }
      });
    return () => { ignore = true; };
  }, [user?.id, isOwner, routeUsername]);

  const openChatFromProfile = () => {
    if (!routeUsername) {return;}
    navigate(`/messages/${encodeURIComponent(routeUsername)}`);
  };

  const handleGuestContinue = () => {
    const nextUsername = guestUsernameDraft.trim();
    if (!nextUsername) {return;}
    startAuthPageFlow({
      navigate,
      location,
      tab: "register",
      authContext: "account",
      mergeGuest: true,
      prefillUsername: nextUsername,
    });
  };

  const openFollowDrawer = (mode) => {
    openDrawerWithHistory({ navigate, location, param: "profileDrawer", value: mode });
  };

  const closeFollowDrawer = () => {
    closeDrawerWithHistory({ navigate, location, param: "profileDrawer", value: followDrawerMode });
  };

  const headerUser = header.user || {};

  const handleToggleFollow = async (target, forceMode = null) => {
    if (!user?.id || user?.is_guest) {
      startAuthPageFlow({ navigate, location, tab: "register", authContext: "account", mergeGuest: true });
      return;
    }
    const username = target?.username || headerUser?.username;
    if (!username) {return;}
    const followed = Boolean(target?.is_followed_by_me ?? headerUser?.is_followed_by_me);
    const method = followed ? "DELETE" : "POST";
    if (!target) {setFollowBusy(true);}
    setFollowDrawerItems((prev)=>prev.map((i)=> i.id===target?.id ? {...i,_loading:true}:i));
    const res = await fetch(`/users/${encodeURIComponent(username)}/follow/`, { method, credentials: "same-origin", headers: { "X-CSRFToken": getCookie("csrftoken"), Accept: "application/json" } });
    const data = await res.json().catch(()=>({}));
    if (res.ok) {
      setHeader((prev)=>({ ...prev, user: prev.user ? { ...prev.user, is_followed_by_me: Boolean(data.followed), followers_count: Math.max(0, Number(data.followers_count||0)) } : prev.user }));
      setFollowDrawerItems((prev)=>prev.map((i)=> i.id===target?.id ? {...i,is_followed_by_me:Boolean(data.followed),_loading:false}: {...i,_loading:false}));
    } else {
      setFollowDrawerItems((prev)=>prev.map((i)=> ({...i,_loading:false})));
    }
    if (!target) {setFollowBusy(false);}
  };

  useEffect(() => {
    const mode = matchesDrawerSearch(location, "profileDrawer", "followers") ? "followers" : (matchesDrawerSearch(location, "profileDrawer", "following") ? "following" : null);
    setFollowDrawerMode(mode);
    if (!mode) {return;}
    const uname = (header.user?.username || routeUsername || user?.username || "").trim();
    if (!uname) {return;}
    setFollowDrawerLoading(true);
    setFollowDrawerError("");
    fetch(`/users/${encodeURIComponent(uname)}/${mode}/?page=1&page_size=20`, { credentials: "same-origin", headers: { Accept: "application/json" }})
      .then((r)=>r.json().then((d)=>({ok:r.ok,d})))
      .then(({ok,d})=>{
        if (!ok) { setFollowDrawerError("Impossible de charger la liste."); return; }
        setFollowDrawerItems(Array.isArray(d?.results) ? d.results : []);
      })
      .catch(()=>setFollowDrawerError("Impossible de charger la liste."))
      .finally(()=>setFollowDrawerLoading(false));
  }, [location.search, header.user?.username, routeUsername, user?.username]);

  if (shouldCanonicalRedirect) {
    return (
      <Navigate
        to={`/profile${location.search || ""}${location.hash || ""}`}
        replace
      />
    );
  }

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
        <Typography>
          Une erreur s&apos;est produite, veuillez réessayer ulterieurement
        </Typography>
      </Box>
    );
  }
  const totalDeposits = headerUser?.total_deposits ?? 0;
  const depositsCount = `${totalDeposits} partage${
    totalDeposits > 1 ? "s" : ""
  }`;
  const trimmedGuestUsername = guestUsernameDraft.trim();
  const userStatusName = String(headerUser?.status?.name || "").trim();

  return (
    <Box className="profile">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          m: "0 16px",
          pb: "12px",
        }}
      >
        {isOwner && !isGuestOwner && (
          <IconButton
            aria-label="Réglages"
            onClick={() => navigate("/profile/settings")}
          >
            <SettingsIcon size="large" />
          </IconButton>
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "left", gap: "12px" }}>

        <Box sx={{ display: "flex", flexDirection: "row", alignItems: "left", gap: 0 }}> 
        
          <Avatar
            src={headerUser?.profile_picture_url || undefined}
            alt={headerUser?.display_name || ""}
            sx={{ width: 64, height: 64 }}
          />
  
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "left", gap: "12px" }}> 
            <Box sx={{ display: "flex", flexDirection: "row", alignItems: "left", gap: "6px", mb: "16px" }}>
              <Typography variant="h4">{headerUser?.display_name}</Typography>
              {isOwner && !isGuestOwner && (
                <IconButton
                  aria-label="Modifier"
                  onClick={() => navigate("/profile/edit")}
                  size="small"
                >
                  <EditIcon />
                </IconButton>
              )}
            </Box>
    
    
            {userStatusName && (
              <Box className="status">
                <Typography className="statusName" variant="body1">{userStatusName}</Typography>
                <Typography variant="h5">• {depositsCount}</Typography>
              </Box>
            )}
    
            <Box sx={{ display: "flex", gap: 2 }}>
              <Button variant="text" onClick={() => openFollowDrawer("followers")}>{`${headerUser?.followers_count || 0} abonnés`}</Button>
              <Button variant="text" onClick={() => openFollowDrawer("following")}>{`${headerUser?.following_count || 0} abonnements`}</Button>
            </Box>
          </Box> 
        </Box> 
  
        {!isOwner && user?.id ? (
          <Box sx={{ display: "flex", width: "100%", gap: "6px", alignItems: "center", justifyContent: "center" }}>
            <FollowButton isFollowed={Boolean(headerUser?.is_followed_by_me)} loading={followBusy} onClick={() => handleToggleFollow(null)} />
            <Button
              variant="outlined"
              disabled={!chatState?.allow_private_message_requests}
              onClick={openChatFromProfile}
            >
              {chatState?.state === "accepted"
                ? "Ouvrir le chat"
                : chatState?.state === "pending_sent"
                  ? "Demande envoyée"
                  : "Envoyer une chanson"}
            </Button>
          </Box>
        ) : null}

      </Box>

      <FavoriteSongSection
        profileUser={headerUser}
        isOwner={isOwner}
        isGuestOwner={isGuestOwner}
        initialFavoriteDeposit={headerUser?.favorite_deposit || null}
      />

      {isOwner ? (
        <>
          <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="fullWidth">
            <Tab label="Découvertes" />
            <Tab label="Partages" />
          </Tabs>

          <TabPanel value={tab} index={0}>
            <Library />
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Shares me={true} user={user} autoLoad={true} />
          </TabPanel>
        </>
      ) : (
        <Shares username={routeUsername} me={false} user={user} autoLoad={true} />
      )}
      <ProfileFollowDrawer
        open={Boolean(followDrawerMode)}
        mode={followDrawerMode || "followers"}
        items={followDrawerItems}
        loading={followDrawerLoading}
        error={followDrawerError}
        onClose={closeFollowDrawer}
        onToggleFollow={handleToggleFollow}
        currentUserId={user?.id || null}
      />
    </Box>
  );
}
