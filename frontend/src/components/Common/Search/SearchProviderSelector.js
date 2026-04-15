import React, { useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputAdornment from "@mui/material/InputAdornment";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";

export const PERSONALIZED_SEARCH_PROVIDER_CODES = ["spotify"];
export const NO_PERSONALIZED_RESULTS_PROVIDER = "none";

const PROVIDER_LABELS = {
  spotify: "Spotify",
};

const PROVIDER_ICON_PATHS = {
  spotify: "/static/images/spotify_logo_icon.svg",
};

export function getConnectedPersonalizedProviderCodes(user) {
  return PERSONALIZED_SEARCH_PROVIDER_CODES.filter((providerCode) => {
    const connection = user?.provider_connections?.[providerCode];
    return Boolean(connection?.connected && connection?.access_token);
  });
}

export function getLastPlatformStorageKey(user) {
  const userId = user?.id;
  if (!userId || user?.is_guest) return null;
  return `mm_last_platform:user:${userId}`;
}

export function readStoredSelectedProvider(user) {
  const storageKey = getLastPlatformStorageKey(user);
  if (!storageKey || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const normalized = String(raw).trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === NO_PERSONALIZED_RESULTS_PROVIDER) return NO_PERSONALIZED_RESULTS_PROVIDER;
    return PERSONALIZED_SEARCH_PROVIDER_CODES.includes(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function writeStoredSelectedProvider(user, providerCode) {
  const storageKey = getLastPlatformStorageKey(user);
  if (!storageKey || typeof window === "undefined") return;

  const normalized = normalizeSelectedProviderCode(providerCode);
  try {
    window.localStorage.setItem(storageKey, normalized);
  } catch {}
}

export function normalizeSelectedProviderCode(providerCode) {
  const normalized = String(providerCode || "").trim().toLowerCase();
  if (!normalized || normalized === NO_PERSONALIZED_RESULTS_PROVIDER) {
    return NO_PERSONALIZED_RESULTS_PROVIDER;
  }
  return PERSONALIZED_SEARCH_PROVIDER_CODES.includes(normalized)
    ? normalized
    : NO_PERSONALIZED_RESULTS_PROVIDER;
}

export function resolveInitialSelectedProvider(user) {
  const connectedProviders = getConnectedPersonalizedProviderCodes(user);
  const stored = readStoredSelectedProvider(user);

  if (stored === NO_PERSONALIZED_RESULTS_PROVIDER) {
    return NO_PERSONALIZED_RESULTS_PROVIDER;
  }

  if (stored && connectedProviders.includes(stored)) {
    return stored;
  }

  return connectedProviders[0] || NO_PERSONALIZED_RESULTS_PROVIDER;
}

export function reconcileSelectedProvider(currentProvider, user) {
  const connectedProviders = getConnectedPersonalizedProviderCodes(user);
  const normalizedCurrent = normalizeSelectedProviderCode(currentProvider);

  if (normalizedCurrent === NO_PERSONALIZED_RESULTS_PROVIDER) {
    return NO_PERSONALIZED_RESULTS_PROVIDER;
  }

  if (connectedProviders.includes(normalizedCurrent)) {
    return normalizedCurrent;
  }

  return resolveInitialSelectedProvider(user);
}

function SelectorLeadingIcon({ providerCode }) {
  const normalizedProvider = normalizeSelectedProviderCode(providerCode);
  const iconPath =
    normalizedProvider !== NO_PERSONALIZED_RESULTS_PROVIDER
      ? PROVIDER_ICON_PATHS[normalizedProvider]
      : null;

  if (!iconPath) {
    return (
      <SearchIcon
        fontSize="medium"
        className="search_personalization_selector_icon search_personalization_selector_icon--default"
      />
    );
  }

  return (
    <Box
      component="img"
      src={iconPath}
      alt={PROVIDER_LABELS[normalizedProvider] || normalizedProvider}
      className={`search_personalization_selector_icon search_personalization_selector_icon--${normalizedProvider}`}
    />
  );
}

export default function SearchProviderSelector({
  selectedProviderCode = NO_PERSONALIZED_RESULTS_PROVIDER,
  connectedProviderCodes = [],
  onSelectProvider,
  onConnectProvider,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const connectedSet = useMemo(() => new Set(connectedProviderCodes || []), [connectedProviderCodes]);
  const normalizedSelectedProvider = normalizeSelectedProviderCode(selectedProviderCode);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = async (providerCode) => {
    handleClose();
    await onSelectProvider?.(normalizeSelectedProviderCode(providerCode));
  };

  const handleConnect = async (providerCode) => {
    handleClose();
    await onConnectProvider?.(providerCode);
  };

  return (
    <>
      <InputAdornment position="end" className="search_personalization_selector_adornment">
        <ButtonBase
          onClick={handleOpen}
          className="search_personalization_selector_button"
          aria-label="Sélectionner la source des résultats personnalisés"
        >
          <SelectorLeadingIcon providerCode={normalizedSelectedProvider} />
          <ArrowDropDownIcon
            fontSize="medium"
            className="search_personalization_selector_arrow"
          />
        </ButtonBase>
      </InputAdornment>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        keepMounted
        className="search_personalization_selector_menu"
        classes={{
          paper: "search_personalization_selector_menu_paper",
          list: "search_personalization_selector_menu_list",
        }}
      >
        <Box className="search_personalization_selector_modal_header">
          <Typography variant="subtitle1" className="search_personalization_selector_modal_title">
            Résultats personnalisés
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            className="search_personalization_selector_modal_text"
          >
            Choisi quelle plateforme te fournit tes résultats de recherche.
          </Typography>
        </Box>

        <MenuItem
          selected={normalizedSelectedProvider === NO_PERSONALIZED_RESULTS_PROVIDER}
          onClick={() => handleSelect(NO_PERSONALIZED_RESULTS_PROVIDER)}
          className="search_personalization_selector_option search_personalization_selector_option--none"
        >
          Pas de résultats personnalisés
        </MenuItem>

        {Object.keys(PROVIDER_LABELS).map((providerCode) => {
          const isConnected = connectedSet.has(providerCode);
          const label = PROVIDER_LABELS[providerCode] || providerCode;
          const iconPath = PROVIDER_ICON_PATHS[providerCode];

          if (isConnected) {
            return (
              <MenuItem
                key={providerCode}
                selected={normalizedSelectedProvider === providerCode}
                onClick={() => handleSelect(providerCode)}
                className={`search_personalization_selector_option search_personalization_selector_option--${providerCode}`}
              >
                {iconPath ? (
                  <Box
                    component="img"
                    src={iconPath}
                    alt={label}
                    className={`search_personalization_selector_option_icon search_personalization_selector_option_icon--${providerCode}`}
                    sx={{ width: 20, height: 20, display: "block", mr: 1 }}
                  />
                ) : null}
                {label}
              </MenuItem>
            );
          }

          return (
            <Box
              key={providerCode}
              className={`search_personalization_selector_provider search_personalization_selector_provider--${providerCode}`}
            >
              <Button
                variant="light"
                onClick={() => handleConnect(providerCode)}
                className="search_personalization_selector_connect_button"
                startIcon={
                  <Box
                    component="img"
                    src={iconPath}
                    alt={label}
                    sx={{ width: 20, height: 20, display: "block" }}
                  />
                }
              >
                Connecter mon {label}
              </Button>
            </Box>
          );
        })}
      </Menu>
    </>
  );
}
