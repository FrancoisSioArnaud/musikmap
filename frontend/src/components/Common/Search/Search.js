import React, { useContext, useEffect, useMemo, useRef, useState } from "react";

import Alert from "@mui/material/Alert";
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
import { NO_PERSONALIZED_RESULTS_PROVIDER } from "./SearchProviderSelector";

const SERVER_SEARCH_PROVIDER_CODE = "spotify";
const SEARCH_DEBOUNCE_MS = 550;
const CACHE_LOADING_MS = 50;

function normalizeSearchValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function Search({
  visible = true,
  searchValue,
  provider,
  onSelectSong,
  actionLabel = "Déposer",
  depositFlowState = null,
  onDepositVisualComplete,
}) {
  const { user, setUser } = useContext(UserContext) || {};
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const latestUserRef = useRef(user);
  const cacheRef = useRef(new Map());

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const connection = useMemo(
    () => (provider && provider !== NO_PERSONALIZED_RESULTS_PROVIDER ? getProviderConnection(user, provider) : null),
    [provider, user?.provider_connections]
  );

  const normalizedQuery = useMemo(() => normalizeSearchValue(searchValue), [searchValue]);
  const normalizedQueryKey = useMemo(() => normalizedQuery.toLowerCase(), [normalizedQuery]);

  useEffect(() => {
    if (!normalizedQuery) {
      setIsSearching(false);
      setSearchError("");
      return undefined;
    }

    const effectiveProvider = provider && provider !== NO_PERSONALIZED_RESULTS_PROVIDER ? provider : "server";
    const cacheKey = `${effectiveProvider}::${normalizedQueryKey}`;

    if (cacheRef.current.has(cacheKey)) {
      let cancelled = false;

      const applyCachedResults = async () => {
        setSearchError("");
        setIsSearching(true);
        await sleep(CACHE_LOADING_MS);
        if (cancelled) {
          return;
        }
        setResults(cacheRef.current.get(cacheKey) || []);
        setIsSearching(false);
      };

      applyCachedResults();

      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const doFetch = async () => {
        try {
          setSearchError("");
          setIsSearching(true);
          let nextResults = [];
          let shouldFallbackToServer = provider === NO_PERSONALIZED_RESULTS_PROVIDER;

          if (!shouldFallbackToServer && connection?.connected && connection?.access_token) {
            try {
              const accessToken =
                provider === "spotify"
                  ? await ensureValidSpotifyAccessToken({ user: latestUserRef.current, setUser })
                  : connection.access_token;

              if (!accessToken) {
                shouldFallbackToServer = true;
              } else {
                nextResults = await searchTracksViaProviderClient(provider, normalizedQuery, accessToken, {
                  signal: controller.signal,
                });
              }
            } catch (error) {
              if (error?.name === "AbortError") {
                return;
              }
              shouldFallbackToServer = true;
            }
          } else if (!shouldFallbackToServer) {
            shouldFallbackToServer = true;
          }

          if (shouldFallbackToServer) {
            nextResults = await searchTracksViaBackend(SERVER_SEARCH_PROVIDER_CODE, normalizedQuery, {
              signal: controller.signal,
            });
          }

          if (!controller.signal.aborted) {
            const safeResults = Array.isArray(nextResults) ? nextResults : [];
            cacheRef.current.set(cacheKey, safeResults);
            setResults(safeResults);
            setSearchError("");
          }
        } catch (error) {
          if (!controller.signal.aborted && error?.name !== "AbortError") {
            setResults([]);
            setSearchError("Oops, une erreur s’est produite. Réessaie dans un instant.");
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
  }, [connection?.access_token, connection?.connected, normalizedQuery, normalizedQueryKey, provider, setUser]);

  if (!visible) {
    return null;
  }

  return (
    <SongList
      items={results}
      isLoading={isSearching}
      depositFlowState={depositFlowState}
      onSelectSong={onSelectSong}
      onDepositVisualComplete={onDepositVisualComplete}
      actionLabel={actionLabel}
      emptyContent={
        <Box sx={{ px: 5, py: 3 }}>
          {searchError ? (
            <Alert severity="error">{searchError}</Alert>
          ) : (
            <Typography variant="body1">Aucun résultat.</Typography>
          )}
        </Box>
      }
    />
  );
}
