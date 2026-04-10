import React from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";

export default function SongSearchResultsList({
  results,
  isSearching,
  posting = false,
  postingId = null,
  postingProgress = 0,
  postingTransitionMs = 0,
  onAction,
  actionLabel = "Déposer",
  emptyContent = null,
}) {
  if (isSearching) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!Array.isArray(results) || results.length === 0) {
    return emptyContent || null;
  }

  return (
    <List disablePadding>
      {results.map((option) => {
        const id = option?.id ?? "__posting__";
        const isThisPosting = posting && postingId === id;

        return (
          <ListItem
            key={id}
            sx={{
              position: "relative",
              overflow: "hidden",
              alignItems: "center",
              px: 2,
              py: 1.5,
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: isThisPosting ? `${postingProgress}%` : "0%",
                bgcolor: "var(--mm-color-primary-light)",
                transitionProperty: "width",
                transitionDuration: `${isThisPosting ? postingTransitionMs : 0}ms`,
                transitionTimingFunction: "cubic-bezier(.17,.49,.88,.61)",
                pointerEvents: "none",
              }}
            />

            <Box
              sx={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: 2,
                width: "100%",
                minWidth: 0,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "var(--mm-radius-xs)",
                  overflow: "hidden",
                  flexShrink: 0,
                  bgcolor: "action.hover",
                }}
              >
                {option?.image_url_small ? (
                  <Box
                    component="img"
                    src={option.image_url_small}
                    alt={option.name || "Cover"}
                    sx={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : null}
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                  flex: 1,
                  overflow: "hidden",
                }}
              >
                <Typography
                  component="h3"
                  variant="h6"
                  noWrap
                  sx={{
                    fontWeight: 700,
                    textAlign: "left",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                  title={option?.name || ""}
                >
                  {option?.name || ""}
                </Typography>
                <Typography
                  component="p"
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  sx={{
                    textAlign: "left",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                  title={option?.artist || ""}
                >
                  {option?.artist || ""}
                </Typography>
              </Box>

              <Box sx={{ flexShrink: 0 }}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={posting}
                  onClick={() => onAction?.(option)}
                  sx={{ minWidth: 0 }}
                >
                  {isThisPosting ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <CircularProgress
                        size={16}
                        sx={{ color: "var(--mm-color-primary-contrast-text)" }}
                      />
                      {actionLabel}
                    </Box>
                  ) : (
                    actionLabel
                  )}
                </Button>
              </Box>
            </Box>
          </ListItem>
        );
      })}
    </List>
  );
}
