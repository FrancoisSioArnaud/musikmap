import { useState, useEffect, useContext } from "react";

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";

export default function useSongSearch({ initialPlatform = "spotify", debounceMs = 400 } = {}) {
  const { user } = useContext(UserContext) || {};

  const [searchValue, setSearchValue] = useState("");
  const [selectedStreamingService, setSelectedStreamingService] = useState(
    user?.preferred_platform || initialPlatform
  );
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

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
          const csrftoken = getCookie("csrftoken");

          if (selectedStreamingService === "spotify") {
            const response = await fetch("/spotify/search", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
              },
              body: JSON.stringify({ search_query: trimmedSearch }),
            });
            const json = await response.json().catch(() => []);
            setResults(Array.isArray(json) ? json : []);
            return;
          }

          if (selectedStreamingService === "deezer") {
            const response = await fetch("/deezer/search", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "X-CSRFToken": csrftoken,
              },
              body: JSON.stringify({ search_query: trimmedSearch }),
            });
            const json = await response.json().catch(() => []);
            setResults(Array.isArray(json) ? json : []);
            return;
          }

          setResults([]);
        } catch {
          setResults([]);
        } finally {
          setIsSearching(false);
        }
      };

      doFetch();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, searchValue, selectedStreamingService]);

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
    isSearching,
    resetSearch,
  };
}
