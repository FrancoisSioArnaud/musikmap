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

export function getDefaultSelectedProvider(user) {
  const connectedProviders = getConnectedPersonalizedProviderCodes(user);
  const rawLastPlatform = String(user?.last_platform || "").trim().toLowerCase();

  if (rawLastPlatform && connectedProviders.includes(rawLastPlatform)) {
    return rawLastPlatform;
  }

  return connectedProviders[0] || null;
}

function SelectorLeadingIcon({ providerCode }) {
  const iconPath = providerCode ? PROVIDER_ICON_PATHS[providerCode] : null;

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
      alt={PROVIDER_LABELS[providerCode] || providerCode}
      className={`search_personalization_selector_icon search_personalization_selector_icon--${providerCode}`}
    />
  );
}

export default function SearchProviderSelector({
  selectedProviderCode = null,
  connectedProviderCodes = [],
  onSelectProvider,
  onConnectProvider,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const connectedSet = useMemo(() => new Set(connectedProviderCodes || []), [connectedProviderCodes]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = async (providerCode) => {
    handleClose();
    await onSelectProvider?.(providerCode);
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
          <SelectorLeadingIcon providerCode={selectedProviderCode} />
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
          selected={!selectedProviderCode}
          onClick={() => handleSelect(null)}
          className="search_personalization_selector_option search_personalization_selector_option--none"
        >
          Pas de résultats personnalisés
        </MenuItem>

        {Object.keys(PROVIDER_LABELS).map((providerCode) => {
          const isConnected = connectedSet.has(providerCode);
          const label = PROVIDER_LABELS[providerCode] || providerCode;

          if (isConnected) {
            return (
              <MenuItem
                key={providerCode}
                selected={selectedProviderCode === providerCode}
                onClick={() => handleSelect(providerCode)}
                className={`search_personalization_selector_option search_personalization_selector_option--${providerCode}`}
              >
                {label}
              </MenuItem>
            );
          }

          return (
            <Box
              key={providerCode}
              className={`search_personalization_selector_provider search_personalization_selector_provider--${providerCode}`}
            >
              <Typography variant="body1" className="search_personalization_selector_provider_label">
                {label}
              </Typography>
              <Button
                variant="light"
                onClick={() => handleConnect(providerCode)}
                className="search_personalization_selector_connect_button"
                startIcon={
                  <Box
                    component="img"
                    src={PROVIDER_ICON_PATHS[providerCode]}
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
