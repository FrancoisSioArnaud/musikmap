import React, { useContext, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { UserContext } from "../UserContext";
import ClientAdminSidebar, {
  CLIENT_ADMIN_DRAWER_WIDTH,
} from "./ClientAdminSidebar";

function getPageTitle(pathname) {
  if (pathname === "/client") return "Dashboard";
  if (pathname === "/client/articles") return "Mes articles";
  if (pathname === "/client/articles/new") return "Nouvel article";
  if (pathname.startsWith("/client/articles/")) return "Modifier l’article";
  return "Espace client";
}

function getClientSlug(user) {
  return user?.client_slug || user?.clientSlug || user?.client?.slug || "default";
}

function getClientName(user) {
  return user?.client_name || user?.client?.name || "Client";
}

export default function ClientAdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user, setCurrentClient } = useContext(UserContext);

  const pageTitle = useMemo(() => getPageTitle(location.pathname), [location.pathname]);
  const clientSlug = useMemo(() => getClientSlug(user), [user]);
  const clientName = useMemo(() => getClientName(user), [user]);

  useEffect(() => {
    if (clientSlug && setCurrentClient) {
      setCurrentClient(clientSlug);
    }
  }, [clientSlug, setCurrentClient]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <ClientAdminSidebar
        variant="temporary"
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <ClientAdminSidebar variant="permanent" />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          ml: { md: `${CLIENT_ADMIN_DRAWER_WIDTH}px` },
        }}
      >
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Toolbar sx={{ minHeight: "72px !important", gap: 2 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ display: { md: "none" } }}
            >
              <MenuRoundedIcon />
            </IconButton>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" noWrap>
                {pageTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {clientName}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                label={user?.client_role === "client_owner" ? "Owner" : "Editor"}
                size="small"
                color="primary"
                variant="outlined"
              />
              <Avatar
                alt={user?.username || "user"}
                src={user?.profile_picture_url || ""}
              >
                {user?.username?.[0]?.toUpperCase() || "U"}
              </Avatar>
            </Stack>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
