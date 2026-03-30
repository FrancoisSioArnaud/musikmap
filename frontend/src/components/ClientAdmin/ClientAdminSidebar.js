import React, { useContext, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import StorefrontRoundedIcon from "@mui/icons-material/StorefrontRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import { UserContext } from "../UserContext";

export const CLIENT_ADMIN_DRAWER_WIDTH = 280;

function getClientDisplayName(user) {
  if (!user) return "Client";
  return (
    user.client_name ||
    user.client?.name ||
    user.clientSlug ||
    user.client_slug ||
    "Client"
  );
}

function getClientDescription(user) {
  return user?.client_role === "client_owner" ? "Owner" : "Editor";
}

function NavItem({ to, label, icon, onClick, isActive }) {
  return (
    <ListItemButton
      component={NavLink}
      to={to}
      onClick={onClick}
      selected={isActive}
      sx={{
        borderRadius: 2,
        mb: 0.5,
        "&.active": {
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "& .MuiListItemIcon-root": {
            color: "primary.contrastText",
          },
        },
      }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
      <ListItemText primary={label} />
    </ListItemButton>
  );
}

export default function ClientAdminSidebar({
  mobileOpen,
  onClose,
  variant = "permanent",
}) {
  const { user } = useContext(UserContext);
  const location = useLocation();

  const clientName = useMemo(() => getClientDisplayName(user), [user]);
  const clientDescription = useMemo(() => getClientDescription(user), [user]);

  const sidebarContent = (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
      }}
    >
      <Toolbar
        sx={{
          minHeight: "72px !important",
          alignItems: "flex-start",
          px: 2,
          pt: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ width: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <StorefrontRoundedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Espace client
            </Typography>
          </Box>

          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {clientName}
          </Typography>

          <Typography variant="body2" color="text.secondary">
            {clientDescription}
          </Typography>
        </Box>
      </Toolbar>

      <Divider />

      <Box sx={{ px: 1.5, py: 2, flex: 1 }}>
        <List disablePadding>
          <NavItem
            to="/client"
            label="Dashboard"
            icon={<DashboardRoundedIcon />}
            onClick={onClose}
            isActive={location.pathname === "/client"}
          />
          <NavItem
            to="/client/articles"
            label="Mes articles"
            icon={<ArticleRoundedIcon />}
            onClick={onClose}
            isActive={
              location.pathname === "/client/articles" ||
              location.pathname.startsWith("/client/articles/")
            }
          />
          <NavItem
            to="/client/incitation"
            label="Mes phrases d’incitation"
            icon={<CampaignRoundedIcon />}
            onClick={onClose}
            isActive={location.pathname === "/client/incitation"}
          />
        </List>
      </Box>
    </Box>
  );

  if (variant === "temporary") {
    return (
      <Drawer
        open={mobileOpen}
        onClose={onClose}
        variant="temporary"
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: CLIENT_ADMIN_DRAWER_WIDTH,
            boxSizing: "border-box",
          },
        }}
      >
        {sidebarContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      open
      sx={{
        display: { xs: "none", md: "block" },
        "& .MuiDrawer-paper": {
          width: CLIENT_ADMIN_DRAWER_WIDTH,
          boxSizing: "border-box",
          borderRight: "1px solid",
          borderColor: "divider",
        },
      }}
    >
      {sidebarContent}
    </Drawer>
  );
}
