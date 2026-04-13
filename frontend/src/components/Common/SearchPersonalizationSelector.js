import React, { useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import SearchIcon from "@mui/icons-material/Search";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import InputAdornment from "@mui/material/InputAdornment";

const PROVIDER_LABELS = {
  spotify: "Spotify",
};

const PROVIDER_ICON_PATHS = {
  spotify: "/static/images/spotify_logo_icon.svg",
};

function SelectorLeadingIcon({ providerCode }) {
  const iconPath = providerCode ? PROVIDER_ICON_PATHS[providerCode] : null;

  if (!iconPath) {
    return <SearchIcon fontSize="medium" className="search_personalization_selector_icon search_personalization_selector_icon--default" />;
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

export default function SearchPersonalizationSelector({
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

      <Box
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        keepMounted
        className="search_personalization_selector_menu"
        classes={{ paper: "search_personalization_selector_menu_paper", list: "search_personalization_selector_menu_list" }}
      >
        <Box className="search_personalization_selector_modal_header">
          <Typography variant="subtitle1" className="search_personalization_selector_modal_title">
            Résultats personnalisés
          </Typography>
          <Typography variant="body1" color="text.secondary" className="search_personalization_selector_modal_text">
            Choisi quelle plateforme te fournit tes résultats de recherche.
          </Typography>
        </Box>

        <Box
          selected={!selectedProviderCode}
          onClick={() => handleSelect(null)}
          className="search_personalization_selector_option search_personalization_selector_option--none"
        >
          Pas de résultats personnalisés
        </Box>

        <Divider className="search_personalization_selector_divider" />

        {Object.keys(PROVIDER_LABELS).map((providerCode) => {
          const isConnected = connectedSet.has(providerCode);
          const label = PROVIDER_LABELS[providerCode] || providerCode;

          if (isConnected) {
            return (
              <Box
                key={providerCode}
                selected={selectedProviderCode === providerCode}
                onClick={() => handleSelect(providerCode)}
                className={`search_personalization_selector_option search_personalization_selector_option--${providerCode}`}
              >
                {label}
              </Box>
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
              >
                Connecter mon {label}
              </Button>
            </Box>
          );
        })}
      </Box>
    </>
  );
}
