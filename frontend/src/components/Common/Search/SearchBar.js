import TextField from "@mui/material/TextField";
import React from "react";


import SearchProviderSelector from "./SearchProviderSelector";

export default function SearchBar({
  inputRef,
  value,
  onChange,
  onFocus,
  onBlur,
  selectedProviderCode,
  connectedProviderCodes,
  onSelectProvider,
  onConnectProvider,
  placeholder = "Chercher une chanson ou artiste",
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
      onFocus={onFocus}
      onBlur={onBlur}
      inputProps={{ inputMode: "search" }}
      InputProps={{
        endAdornment: (
          <SearchProviderSelector
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
