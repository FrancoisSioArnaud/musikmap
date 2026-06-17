import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React, { useContext, useEffect } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";

import { FlowboxSessionContext } from "./FlowboxSessionContext";

export default function InBoxSessionGate() {
  const { boxSlug } = useParams();
  const location = useLocation();
  const { getActiveSessionForSlug, getBoxRuntime, ensureBoxSession, sessionLoadStateBySlug } =
    useContext(FlowboxSessionContext);

  const runtime = getBoxRuntime(boxSlug);
  const activeSession = getActiveSessionForSlug(boxSlug);
  const loadState = sessionLoadStateBySlug?.[boxSlug] || "idle";

  useEffect(() => {
    if (!boxSlug) {return;}
    if (!activeSession && loadState === "idle") {
      ensureBoxSession(boxSlug);
    }
  }, [activeSession, boxSlug, ensureBoxSession, loadState]);

  if (loadState === "loading" && !activeSession) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Ouverture de la boîte…</Typography>
        </Box>
      </Box>
    );
  }

  if (activeSession) {
    return <Outlet />;
  }

  if (runtime?.lastSessionExpiredAt) {
    return <Navigate to={`/flowbox/${encodeURIComponent(boxSlug)}/closed`} replace state={{ from: location.pathname }} />;
  }

  return <Navigate to={`/flowbox/${encodeURIComponent(boxSlug)}/`} replace state={{ error: "Ouvre la boîte pour continuer." }} />;
}
