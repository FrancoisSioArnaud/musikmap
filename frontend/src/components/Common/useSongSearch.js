import { useState, useEffect, useContext, useMemo, useCallback, useRef } from "react";

import { UserContext } from "../UserContext";
import { setLastPlatform } from "../UsersUtils";
import { ensureValidSpotifyAccessToken } from "../Utils/streaming/SpotifyUtils";
import {
  PERSONALIZED_SEARCH_PROVIDER_CODES,
  SERVER_SEARCH_PROVIDER_CODE,
  authenticateProviderUser,
  fetchRecentPlaysViaProviderClient,
  getConnectedPersonalizedProviderCodes,
  getProviderConnection,
  searchTracksViaBackend,
  searchTracksViaProviderClient,
} from "../Utils/streaming/providerClient";

function getDefaultSelectedProvider(user) {
  const connectedProviders = getConnectedPersonalizedProviderCodes(user);
  const rawLastPlatform = String(user?.last_platform || "").trim().toLowerCase();

  if (rawLastPlatform && connectedProviders.includes(rawLastPlatform)) {
    return rawLastPlatform;
  }

  return connectedProviders[0] || null;
}

function buildSocialSpotifyLoginUrl() {
  const next = encodeURIComponent(
    `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
  );
  return `/oauth/login/spotify/?next=${next}`;
}

export default function useSongSearch({ initialPlatform = null, debounceMs = 400 } = {}) {
  const { user, setUser, isAuthenticated } = useContext(UserContext) || {};

  const [searchValue, setSearchValue] = useState("");
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    getDefaultSelectedProvider(user) || initialPlatform || null
  );
  const [results, setResults] = useState([]);
  const manualSelectionRef = useRef(false);
  const [recentPlays, setRecentPlays] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingRecentPlays, setIsLoadingRecentPlays] = useState(false);

  const connectedPersonalizedProviderCodes = useMemo(
    () => getConnectedPersonalizedProviderCodes(user),
    [user]
  );

  const effectiveSelectedProvider = useMemo(() => {
    if (selectedStreamingService && connectedPersonalizedProviderCodes.includes(selectedStreamingService)) {
      return selectedStreamingService;
    }
    return null;
  }, [connectedPersonalizedProviderCodes, selectedStreamingService]);

  useEffect(() => {
    const nextDefault = getDefaultSelectedProvider(user) || initialPlatform || null;
    setSelectedStreamingService((previous) => {
      if (manualSelectionRef.current) {
        if (previous === null) {
          return null;
        }
        if (previous && connectedPersonalizedProviderCodes.includes(previous)) {
          return previous;
        }
      }
      return nextDefault;
    });
  }, [connectedPersonalizedProviderCodes, initialPlatform, user?.id, user?.last_platform, user?.provider_connections]);

  const handleSelectStreamingService = useCallback(
    async (nextProviderCode) => {
      const normalizedProvider =
        nextProviderCode && PERSONALIZED_SEARCH_PROVIDER_CODES.includes(nextProviderCode)
          ? nextProviderCode
          : null;

      manualSelectionRef.current = true;
      setSelectedStreamingService(normalizedProvider);

      const responseData = await setLastPlatform(normalizedProvider);
      if (responseData?.current_user && setUser) {
        setUser(responseData.current_user);
      }

      return Boolean(responseData);
    },
    [setUser]
  );

  const handleConnectProvider = useCallback(
    async (providerCode) => {
      if (providerCode !== "spotify") return;

      if (isAuthenticated && !user?.is_guest) {
        await authenticateProviderUser("spotify");
        return;
      }

      window.location.assign(buildSocialSpotifyLoginUrl());
    },
    [isAuthenticated, user?.is_guest]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const doFetch = async () => {
        const trimmedSearch = searchValue.trim();
        if (!trimmedSearch) {
          setResults([]);
          setIsSearching(false);
          return;
        }

        try {
          setIsSearching(true);
          const connection = effectiveSelectedProvider
            ? getProviderConnection(user, effectiveSelectedProvider)
            : null;
          let nextResults = [];

          if (effectiveSelectedProvider && connection?.connected && connection?.access_token) {
            try {
              const accessToken =
                effectiveSelectedProvider === "spotify"
                  ? await ensureValidSpotifyAccessToken({ user, setUser })
                  : connection.access_token;

              if (accessToken) {
                nextResults = await searchTracksViaProviderClient(
                  effectiveSelectedProvider,
                  trimmedSearch,
                  accessToken,
                  { signal: controller.signal }
                );
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

          setResults(Array.isArray(nextResults) ? nextResults : []);
        } catch (error) {
          if (error?.name !== "AbortError") {
            setResults([]);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      };

      doFetch();
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, effectiveSelectedProvider, searchValue, user]);

  useEffect(() => {
    const trimmedSearch = searchValue.trim();
    if (trimmedSearch || !effectiveSelectedProvider) {
      setRecentPlays([]);
      setIsLoadingRecentPlays(false);
      return;
    }

    const controller = new AbortController();
    const connection = getProviderConnection(user, effectiveSelectedProvider);
    if (!connection?.connected || !connection?.can_recent_plays || !connection?.access_token) {
      setRecentPlays([]);
      setIsLoadingRecentPlays(false);
      return () => controller.abort();
    }

    const loadRecentPlays = async () => {
      try {
        setIsLoadingRecentPlays(true);
        const accessToken =
          effectiveSelectedProvider === "spotify"
            ? await ensureValidSpotifyAccessToken({ user, setUser })
            : connection.access_token;

        if (!accessToken) {
          if (!controller.signal.aborted) {
            setRecentPlays([]);
          }
          return;
        }

        const items = await fetchRecentPlaysViaProviderClient(
          effectiveSelectedProvider,
          accessToken,
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setRecentPlays(Array.isArray(items) ? items : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setRecentPlays([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingRecentPlays(false);
        }
      }
    };

    loadRecentPlays();
    return () => controller.abort();
  }, [effectiveSelectedProvider, searchValue, user]);

  const resetSearch = () => {
    setSearchValue("");
    setResults([]);
    setIsSearching(false);
  };

  return {
    searchValue,
    setSearchValue,
    selectedStreamingService: effectiveSelectedProvider,
    setSelectedStreamingService: handleSelectStreamingService,
    connectedPersonalizedProviderCodes,
    connectProvider: handleConnectProvider,
    results,
    recentPlays,
    isSearching,
    isLoadingRecentPlays,
    canShowRecentPlays: Boolean(effectiveSelectedProvider),
    resetSearch,
  };
}
