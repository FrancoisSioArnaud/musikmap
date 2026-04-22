
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import { UserContext } from "../../UserContext";
import { fetchRecentPlaysViaProviderClient, getProviderConnection } from "../../Utils/streaming/providerClient";
import { ensureValidSpotifyAccessToken } from "../../Utils/streaming/SpotifyUtils";

import { NO_PERSONALIZED_RESULTS_PROVIDER } from "./SearchProviderSelector";
import SongList from "./SongList";

const PROVIDER_LABELS = {
  spotify: "Spotify",
  deezer: "Deezer",
};

export default function RecentlyPlayed({
  provider,
  visible = true,
  onSelectSong,
  actionLabel = "Déposer",
  depositFlowState = null,
  onDepositVisualComplete,
}) {
  const { user, setUser } = useContext(UserContext) || {};
  const [itemsByProvider, setItemsByProvider] = useState({});
  const [statusByProvider, setStatusByProvider] = useState({});
  const [retryCountByProvider, setRetryCountByProvider] = useState({});
  const latestUserRef = useRef(user);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const connection = useMemo(
    () => (provider && provider !== NO_PERSONALIZED_RESULTS_PROVIDER ? getProviderConnection(user, provider) : null),
    [provider, user?.provider_connections]
  );

  const providerLabel = PROVIDER_LABELS[provider] || provider || "ce service";
  const retryCount = retryCountByProvider[provider] || 0;

  useEffect(() => {
    if (!provider || provider === NO_PERSONALIZED_RESULTS_PROVIDER) {
      return undefined;
    }

    if (!connection?.connected || !connection?.can_recent_plays || !connection?.access_token) {
      setItemsByProvider((prev) => ({ ...prev, [provider]: [] }));
      setStatusByProvider((prev) => ({ ...prev, [provider]: "connection_error" }));
      return undefined;
    }

    const controller = new AbortController();

    const loadRecentPlays = async () => {
      try {
        setStatusByProvider((prev) => ({ ...prev, [provider]: "loading" }));

        const accessToken =
          provider === "spotify"
            ? await ensureValidSpotifyAccessToken({ user: latestUserRef.current, setUser })
            : connection.access_token;

        if (!accessToken || controller.signal.aborted) {
          if (!controller.signal.aborted) {
            setItemsByProvider((prev) => ({ ...prev, [provider]: [] }));
            setStatusByProvider((prev) => ({ ...prev, [provider]: "connection_error" }));
          }
          return;
        }

        const nextItems = await fetchRecentPlaysViaProviderClient(provider, accessToken, {
          signal: controller.signal,
          limit: 12,
        });

        if (!controller.signal.aborted) {
          const safeItems = Array.isArray(nextItems) ? nextItems : [];
          setItemsByProvider((prev) => ({ ...prev, [provider]: safeItems }));
          setStatusByProvider((prev) => ({
            ...prev,
            [provider]: safeItems.length ? "success" : "empty",
          }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setItemsByProvider((prev) => ({ ...prev, [provider]: [] }));
          setStatusByProvider((prev) => ({ ...prev, [provider]: "request_error" }));
        }
      }
    };

    loadRecentPlays();
    return () => controller.abort();
  }, [connection?.access_token, connection?.can_recent_plays, connection?.connected, provider, retryCount, setUser]);

  if (!visible || !provider || provider === NO_PERSONALIZED_RESULTS_PROVIDER) {
    return null;
  }

  const items = itemsByProvider[provider] || [];
  const status = statusByProvider[provider] || "idle";
  const isLoading = status === "loading";

  let emptyContent = (
    <Box sx={{ px: 5, py: 1 }}>
      <Alert severity="info">Aucune écoute récente disponible</Alert>
    </Box>
  );

  if (status === "connection_error") {
    emptyContent = (
      <Box sx={{ px: 5, py: 1 }}>
        <Alert severity="warning">Connexion à {providerLabel} impossible</Alert>
      </Box>
    );
  }

  if (status === "request_error") {
    emptyContent = (
      <Box sx={{ px: 5, py: 1 }}>
        <Alert
          severity="warning"
          action={
            <Button
              variant="light"
              onClick={() => {
                setRetryCountByProvider((prev) => ({
                  ...prev,
                  [provider]: (prev[provider] || 0) + 1,
                }));
              }}
            >
              Réessayer
            </Button>
          }
        >
          La connexion à {providerLabel} a échoué
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        mt: 2,
        pt: 2,
        backgroundColor: "var(--mm-color-primary-light)",
      }}
    >
      <Box sx={{ px: 5, pt: 1 }}>
        <Typography component="h3" variant="subtitle1" sx={{ mb: 1 }}>
          Dernières écoutes
        </Typography>
      </Box>
      <SongList
        items={items}
        isLoading={isLoading}
        depositFlowState={depositFlowState}
        onSelectSong={onSelectSong}
        onDepositVisualComplete={onDepositVisualComplete}
        actionLabel={actionLabel}
        emptyContent={emptyContent}
      />
    </Box>
  );
}
