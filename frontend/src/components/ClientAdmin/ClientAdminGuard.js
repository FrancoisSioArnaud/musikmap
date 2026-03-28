import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { UserContext } from "../UserContext";

function hasClientPortalAccess(user) {
  if (!user) return false;

  const portalStatus = user.portal_status || user.portalStatus || "";
  const hasClient =
    Boolean(user.client) ||
    Boolean(user.client_id) ||
    Boolean(user.client_slug) ||
    Boolean(user.clientSlug);

  return hasClient && portalStatus === "active";
}

export default function ClientAdminGuard({ children }) {
  const { user, isAuthenticated, authChecked } = useContext(UserContext);
  const location = useLocation();

  if (!authChecked) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasClientPortalAccess(user)) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 3,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 520,
            p: { xs: 3, sm: 4 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            textAlign: "center",
          }}
        >
          <LockOutlinedIcon sx={{ fontSize: 44, color: "primary.main", mb: 2 }} />
          <Typography variant="h4" gutterBottom>
            Accès refusé
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Ce compte n’a pas accès au portail client.
          </Typography>
          <Button variant="contained" href="/">
            Retour à l’accueil
          </Button>
        </Paper>
      </Box>
    );
  }

  return children;
}
