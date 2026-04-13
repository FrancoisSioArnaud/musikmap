import { useState, useEffect, useContext } from "react";

import { UserContext } from "../UserContext";
import {
  fetchRecentPlaysViaBackend,
  fetchRecentPlaysViaProviderClient,
  getProviderConnection,
  searchTracksViaBackend,
  searchTracksViaProviderClient,
} from "../Utils/streaming/providerClient";

export default function useSongSearch({ initialPlatform = "spotify", debounceMs = 400 } = {}) {
  const { user } = useContext(UserContext) || {};

  const [searchValue, setSearchValue] = useState("");
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    user?.preferred_platform || initialPlatform
  );
  const [results, setResults] = useState([]);
  const [recentPlays, setRecentPlays] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingRecentPlays, setIsLoadingRecentPlays] = useState(false);

  useEffect(() => {
    if (user?.preferred_platform) {
      setSelectedStreamingService(user.preferred_platform);
    }
  }, [user?.preferred_platform]);

  useEffect(() => {
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
          const connection = getProviderConnection(user, selectedStreamingService);
          let nextResults = [];

          if (connection?.connected && connection?.access_token) {
            try {
              nextResults = await searchTracksViaProviderClient(
                selectedStreamingService,
                trimmedSearch,
                connection.access_token
              );
            } catch (error) {
              nextResults = [];
            }
          }

          if (!Array.isArray(nextResults) || nextResults.length === 0) {
            nextResults = await searchTracksViaBackend(selectedStreamingService, trimmedSearch);
          }

          setResults(Array.isArray(nextResults) ? nextResults : []);
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      };

      doFetch();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, searchValue, selectedStreamingService, user]);

  useEffect(() => {
    const trimmedSearch = searchValue.trim();
    if (trimmedSearch) {
      setRecentPlays([]);
      setIsLoadingRecentPlays(false);
      return;
    }

    let cancelled = false;

    const loadRecentPlays = async () => {
      try {
        setIsLoadingRecentPlays(true);
        const connection = getProviderConnection(user, selectedStreamingService);
        let items = [];

        if (connection?.connected && connection?.can_recent_plays && connection?.access_token) {
          try {
            items = await fetchRecentPlaysViaProviderClient(
              selectedStreamingService,
              connection.access_token
            );
          } catch (error) {
            items = [];
          }
        }

        if (!Array.isArray(items) || items.length === 0) {
          items = await fetchRecentPlaysViaBackend(selectedStreamingService);
        }

        if (!cancelled) {
          setRecentPlays(Array.isArray(items) ? items : []);
        }
      } catch {
        if (!cancelled) {
          setRecentPlays([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRecentPlays(false);
        }
      }
    };

    loadRecentPlays();
    return () => {
      cancelled = true;
    };
  }, [searchValue, selectedStreamingService, user]);

  const resetSearch = () => {
    setSearchValue("");
    setResults([]);
    setIsSearching(false);
  };

  return {
    searchValue,
    setSearchValue,
    selectedStreamingService,
    setSelectedStreamingService,
    results,
    recentPlays,
    isSearching,
    isLoadingRecentPlays,
    resetSearch,
  };
}
