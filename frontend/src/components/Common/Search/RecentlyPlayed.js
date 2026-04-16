import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { UserContext } from "../../UserContext";
import { ensureValidSpotifyAccessToken } from "../../Utils/streaming/SpotifyUtils";
import { fetchRecentPlaysViaProviderClient, getProviderConnection } from "../../Utils/streaming/providerClient";
import SongList from "./SongList";
import { NO_PERSONALIZED_RESULTS_PROVIDER } from "./SearchProviderSelector";

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
  const latestUserRef = useRef(user);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const connection = useMemo(
    () => (provider && provider !== NO_PERSONALIZED_RESULTS_PROVIDER ? getProviderConnection(user, provider) : null),
    [provider, user?.provider_connections]
  );

  useEffect(() => {
    if (!provider || provider === NO_PERSONALIZED_RESULTS_PROVIDER) {
      return undefined;
    }

    if (!connection?.connected || !connection?.can_recent_plays || !connection?.access_token) {
      setItemsByProvider((prev) => ({ ...prev, [provider]: [] }));
      setStatusByProvider((prev) => ({ ...prev, [provider]: "idle" }));
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
            setStatusByProvider((prev) => ({ ...prev, [provider]: "error" }));
          }
          return;
        }

        const nextItems = await fetchRecentPlaysViaProviderClient(provider, accessToken, {
          signal: controller.signal,
          limit: 12,
        });

        if (!controller.signal.aborted) {
          setItemsByProvider((prev) => ({ ...prev, [provider]: Array.isArray(nextItems) ? nextItems : [] }));
          setStatusByProvider((prev) => ({ ...prev, [provider]: "success" }));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setItemsByProvider((prev) => ({ ...prev, [provider]: [] }));
          setStatusByProvider((prev) => ({ ...prev, [provider]: "error" }));
        }
      }
    };

    loadRecentPlays();
    return () => controller.abort();
  }, [connection?.access_token, connection?.can_recent_plays, connection?.connected, provider, setUser]);

  if (!visible || !provider || provider === NO_PERSONALIZED_RESULTS_PROVIDER) {
    return null;
  }

  const items = itemsByProvider[provider] || [];
  const isLoading = statusByProvider[provider] === "loading";

  return (
    <Box>
      <Box sx={{ px: 5, pt: 1 }}>
        <Typography component="h3" variant="subtitle1" sx={{ mb: 1 }}>
          Écouté récemment
        </Typography>
      </Box>
      <SongList
        items={items}
        isLoading={isLoading}
        depositFlowState={depositFlowState}
        onSelectSong={onSelectSong}
        onDepositVisualComplete={onDepositVisualComplete}
        actionLabel={actionLabel}
        emptyContent={
          <Box sx={{ px: 5, py: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Aucune écoute récente disponible.
            </Typography>
          </Box>
        }
      />
    </Box>
  );
}
