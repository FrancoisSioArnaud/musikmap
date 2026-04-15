import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { UserContext } from "../../UserContext";
import { ensureValidSpotifyAccessToken } from "../../Utils/streaming/SpotifyUtils";
import {
  getProviderConnection,
  searchTracksViaBackend,
  searchTracksViaProviderClient,
} from "../../Utils/streaming/providerClient";
import SongList from "./SongList";

const SERVER_SEARCH_PROVIDER_CODE = "spotify";
const SEARCH_DEBOUNCE_MS = 400;

export default function Search({
  searchValue,
  provider,
  onSelectSong,
  actionLabel = "Déposer",
  posting = false,
  postingId = null,
  postingProgress = 0,
  postingTransitionMs = 0,
}) {
  const { user, setUser } = useContext(UserContext) || {};
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const latestUserRef = useRef(user);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const connection = useMemo(
    () => (provider ? getProviderConnection(user, provider) : null),
    [provider, user?.provider_connections]
  );

  useEffect(() => {
    const trimmedSearch = String(searchValue || "").trim();
    if (!trimmedSearch) {
      setResults([]);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const doFetch = async () => {
        try {
          setIsSearching(true);
          let nextResults = [];

          if (provider && connection?.connected && connection?.access_token) {
            try {
              const accessToken =
                provider === "spotify"
                  ? await ensureValidSpotifyAccessToken({ user: latestUserRef.current, setUser })
                  : connection.access_token;

              if (accessToken) {
                nextResults = await searchTracksViaProviderClient(provider, trimmedSearch, accessToken, {
                  signal: controller.signal,
                });
              }
            } catch (error) {
              if (error?.name === "AbortError") {
                return;
              }
              nextResults = [];
            }
          }

          if (!Array.isArray(nextResults) || nextResults.length === 0) {
            nextResults = await searchTracksViaBackend(SERVER_SEARCH_PROVIDER_CODE, trimmedSearch, {
              signal: controller.signal,
            });
          }

          if (!controller.signal.aborted) {
            setResults(Array.isArray(nextResults) ? nextResults : []);
          }
        } catch (error) {
          if (!controller.signal.aborted && error?.name !== "AbortError") {
            setResults([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      };

      doFetch();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [connection?.connected, provider, searchValue, setUser]);

  return (
    <SongList
      items={results}
      isLoading={isSearching}
      posting={posting}
      postingId={postingId}
      postingProgress={postingProgress}
      postingTransitionMs={postingTransitionMs}
      onSelectSong={onSelectSong}
      actionLabel={actionLabel}
      emptyContent={
        <Box sx={{ px: 5, py: 3 }}>
          <Typography variant="body1">Aucun résultat.</Typography>
        </Box>
      }
    />
  );
}
