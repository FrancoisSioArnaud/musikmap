import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { UserContext } from "../../UserContext";
import { ensureValidSpotifyAccessToken } from "../../Utils/streaming/SpotifyUtils";
import { fetchRecentPlaysViaProviderClient, getProviderConnection } from "../../Utils/streaming/providerClient";
import SongList from "./SongList";

export default function RecentlyPlayed({
  provider,
  visible = true,
  onSelectSong,
  actionLabel = "Déposer",
  posting = false,
  postingId = null,
  postingProgress = 0,
  postingTransitionMs = 0,
}) {
  const { user, setUser } = useContext(UserContext) || {};
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedProviderRef = useRef(null);
  const latestUserRef = useRef(user);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const connection = useMemo(
    () => (provider ? getProviderConnection(user, provider) : null),
    [provider, user?.provider_connections]
  );

  useEffect(() => {
    if (!provider) {
      fetchedProviderRef.current = null;
      setItems([]);
      setIsLoading(false);
      return undefined;
    }

    if (!connection?.connected || !connection?.can_recent_plays || !connection?.access_token) {
      fetchedProviderRef.current = null;
      setItems([]);
      setIsLoading(false);
      return undefined;
    }

    if (fetchedProviderRef.current === provider) {
      return undefined;
    }

    const controller = new AbortController();

    const loadRecentPlays = async () => {
      try {
        setIsLoading(true);
        const accessToken =
          provider === "spotify"
            ? await ensureValidSpotifyAccessToken({ user: latestUserRef.current, setUser })
            : connection.access_token;

        if (!accessToken || controller.signal.aborted) {
          if (!controller.signal.aborted) {
            setItems([]);
          }
          return;
        }

        const nextItems = await fetchRecentPlaysViaProviderClient(provider, accessToken, {
          signal: controller.signal,
          limit: 12,
        });

        if (!controller.signal.aborted) {
          fetchedProviderRef.current = provider;
          setItems(Array.isArray(nextItems) ? nextItems : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setItems([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadRecentPlays();
    return () => controller.abort();
  }, [connection?.can_recent_plays, connection?.connected, provider, setUser]);

  if (!provider || !visible) {
    return null;
  }

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
        posting={posting}
        postingId={postingId}
        postingProgress={postingProgress}
        postingTransitionMs={postingTransitionMs}
        onSelectSong={onSelectSong}
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
