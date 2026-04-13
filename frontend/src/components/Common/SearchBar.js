import React from "react";

import TextField from "@mui/material/TextField";

import SearchPersonalizationSelector from "./SearchPersonalizationSelector";

export default function SearchBar({
  inputRef,
  value,
  onChange,
  selectedProviderCode,
  connectedProviderCodes,
  onSelectProvider,
  onConnectProvider,
  placeholder = "Chercher une chanson",
  className = "searchfield",
  sx,
}) {
  return (
    <TextField
      inputRef={inputRef}
      fullWidth
      type="search"
      placeholder={placeholder}
      value={value}
      className={className}
      onChange={onChange}
      inputProps={{ inputMode: "search" }}
      InputProps={{
        endAdornment: (
          <SearchPersonalizationSelector
            selectedProviderCode={selectedProviderCode}
            connectedProviderCodes={connectedProviderCodes}
            onSelectProvider={onSelectProvider}
            onConnectProvider={onConnectProvider}
          />
        ),
      }}
      sx={[
        {
          borderRadius: "var(--mm-radius-round)",
          "& .MuiInputBase-input": { fontSize: 16 },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
