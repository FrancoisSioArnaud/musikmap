import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";

import { UserContext } from "../../UserContext";
import { setLastPlatform } from "../../UsersUtils";
import { authenticateProviderUser } from "../../Utils/streaming/providerClient";
import SearchBar from "./SearchBar";
import Search from "./Search";
import RecentlyPlayed from "./RecentlyPlayed";
import {
  getConnectedPersonalizedProviderCodes,
  getDefaultSelectedProvider,
} from "./SearchProviderSelector";

function buildSocialSpotifyLoginUrl() {
  const next = encodeURIComponent(
    `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
  );
  return `/oauth/login/spotify/?next=${next}`;
}

export default function SearchPanel({
  inputRef,
  onSelectSong,
  actionLabel = "Déposer",
  posting = false,
  postingId = null,
  postingProgress = 0,
  postingTransitionMs = 0,
  searchIncitationText = "",
  placeholder = "Chercher une chanson",
  rootSx,
  searchBarWrapperSx,
  contentSx,
  searchBarSx,
}) {
  const { user, setUser, isAuthenticated } = useContext(UserContext) || {};

  const [searchValue, setSearchValue] = useState("");
  const [selectedProvider, setSelectedProvider] = useState(getDefaultSelectedProvider(user));

  const connectedPersonalizedProviderCodes = useMemo(
    () => getConnectedPersonalizedProviderCodes(user),
    [user?.provider_connections, user?.last_platform]
  );

  useEffect(() => {
    setSelectedProvider(getDefaultSelectedProvider(user));
  }, [user?.id, user?.last_platform, user?.provider_connections]);

  const handleSelectProvider = useCallback(
    async (nextProviderCode) => {
      const normalizedProvider = nextProviderCode ? String(nextProviderCode).trim().toLowerCase() : null;
      setSelectedProvider(normalizedProvider || null);

      const responseData = await setLastPlatform(normalizedProvider);
      if (responseData?.current_user && setUser) {
        setUser(responseData.current_user);
      }
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

  const hasSearchValue = Boolean(String(searchValue || "").trim());
  const shouldShowIncitation = !hasSearchValue && Boolean(String(searchIncitationText || "").trim());

  return (
    <Box
      sx={[
        {
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          height: "100%",
        },
        ...(Array.isArray(rootSx) ? rootSx : rootSx ? [rootSx] : []),
      ]}
    >
      <Box sx={searchBarWrapperSx}>
        <SearchBar
          inputRef={inputRef}
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          selectedProviderCode={selectedProvider}
          connectedProviderCodes={connectedPersonalizedProviderCodes}
          onSelectProvider={handleSelectProvider}
          onConnectProvider={handleConnectProvider}
          placeholder={placeholder}
          sx={searchBarSx}
        />
      </Box>

      <Box
        sx={[
          {
            minHeight: 0,
            flex: 1,
          },
          ...(Array.isArray(contentSx) ? contentSx : contentSx ? [contentSx] : []),
        ]}
      >
        {hasSearchValue ? (
          <Search
            searchValue={searchValue}
            provider={selectedProvider}
            onSelectSong={onSelectSong}
            actionLabel={actionLabel}
            posting={posting}
            postingId={postingId}
            postingProgress={postingProgress}
            postingTransitionMs={postingTransitionMs}
          />
        ) : null}

        {!hasSearchValue && shouldShowIncitation ? (
          <Box
            sx={{
              margin: "0px 20px",
              backgroundColor: "var(--mm-color-secondary-light)",
              padding: "16px 20px",
              borderRadius: "var(--mm-radius-lg)",
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <CampaignRoundedIcon />
            <Typography variant="subtitle1">{searchIncitationText}</Typography>
          </Box>
        ) : null}

        <RecentlyPlayed
          provider={selectedProvider}
          visible={!hasSearchValue}
          onSelectSong={onSelectSong}
          actionLabel={actionLabel}
          posting={posting}
          postingId={postingId}
          postingProgress={postingProgress}
          postingTransitionMs={postingTransitionMs}
        />
      </Box>
    </Box>
  );
}
