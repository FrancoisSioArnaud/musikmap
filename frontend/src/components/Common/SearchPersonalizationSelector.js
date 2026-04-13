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
      <InputAdornment position="end" sx={{ ml: 0.5 }}>
        <ButtonBase
          onClick={handleOpen}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            borderRadius: "999px",
            p: 0.5,
            color: "text.secondary",
          }}
          aria-label="Sélectionner la source des résultats personnalisés"
        >
          <SearchIcon fontSize="medium" />
          <ArrowDropDownIcon fontSize="medium" />
        </ButtonBase>
      </InputAdornment>

      <Menu anchorEl={anchorEl} open={open} onClose={handleClose} keepMounted>
        <Box sx={{ px: 2, pt: 1.5, pb: 1, maxWidth: 320 }}>
          <Typography variant="subtitle1">Résultats personnalisés</Typography>
          <Typography variant="body1" color="text.secondary">
            Choisi quelle plateforme te fournit tes résultats de recherche.
          </Typography>
        </Box>

        <MenuItem selected={!selectedProviderCode} onClick={() => handleSelect(null)}>
          Pas de résultats personnalisés
        </MenuItem>

        <Divider />

        {Object.keys(PROVIDER_LABELS).map((providerCode) => {
          const isConnected = connectedSet.has(providerCode);
          const label = PROVIDER_LABELS[providerCode] || providerCode;

          if (isConnected) {
            return (
              <MenuItem
                key={providerCode}
                selected={selectedProviderCode === providerCode}
                onClick={() => handleSelect(providerCode)}
              >
                {label}
              </MenuItem>
            );
          }

          return (
            <Box key={providerCode} sx={{ px: 2, py: 1.5, minWidth: 280 }}>
              <Typography variant="body1" sx={{ mb: 1 }}>
                {label}
              </Typography>
              <Button variant="light" onClick={() => handleConnect(providerCode)}>
                Connecter mon {label}
              </Button>
            </Box>
          );
        })}
      </Menu>
    </>
  );
}
