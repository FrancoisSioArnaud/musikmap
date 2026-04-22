import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React, { useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";

import { UserContext } from "../../UserContext";

import { FlowboxSessionContext } from "./FlowboxSessionContext";

export default function FlowboxBoxShell() {
  const { boxSlug } = useParams();
  const { setCurrentClient } = useContext(UserContext) || {};
  const {
    saveBoxBootstrap,
    markFlowboxVisited,
    clearCurrentFlowboxSlug,
    ensureBoxSession,
    sessionLoadStateBySlug,
  } = useContext(FlowboxSessionContext);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sessionLoadState = sessionLoadStateBySlug?.[boxSlug] || "idle";

  useEffect(() => {
    markFlowboxVisited(boxSlug);
    return () => clearCurrentFlowboxSlug();
  }, [boxSlug, markFlowboxVisited, clearCurrentFlowboxSlug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError("");

        const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.detail || "Impossible de récupérer la boîte.");
        }
        if (cancelled) {return;}

        saveBoxBootstrap({
          slug: data?.slug || boxSlug,
          name: data?.name || "",
          clientSlug: data?.client_slug || "default",
          searchIncitationText: data?.search_incitation_text || "",
          lastDepositDate: data?.last_deposit_date || null,
          lastDepositSongImageUrl: data?.last_deposit_song_image_url || null,
        });

        if (setCurrentClient) {
          setCurrentClient((prev) => (prev === (data?.client_slug || "default") ? prev : (data?.client_slug || "default")));
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError?.message || "Impossible de récupérer la boîte.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boxSlug, saveBoxBootstrap, setCurrentClient]);

  useEffect(() => {
    if (!boxSlug) {return;}
    if (loading || error) {return;}
    if (sessionLoadState !== "idle") {return;}
    ensureBoxSession(boxSlug);
  }, [boxSlug, ensureBoxSession, error, loading, sessionLoadState]);

  if (loading && !error) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Chargement de la boîte…</Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center", p: 3 }}>
        <Typography variant="body1" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  return <Outlet />;
}
