import React from "react";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

export default function SongList({
  items,
  isLoading,
  posting = false,
  postingId = null,
  postingProgress = 0,
  postingTransitionMs = 0,
  onSelectSong,
  actionLabel = "Déposer",
  emptyContent = null,
}) {
  if (isLoading) {
    return (
      <Box className="song_search_loading">
        <CircularProgress className="spinner" size={28} />
      </Box>
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return emptyContent || null;
  }

  return (
    <Box className="song_search_results" disablePadding>
      {items.map((option) => {
        const id = option?.id ?? option?.provider_track_id ?? "__posting__";
        const isThisPosting = posting && postingId === id;

        return (
          <Box className="item" key={id}>
            <Box
              aria-hidden="true"
              className="item_fill"
              style={{
                width: isThisPosting ? `${postingProgress}%` : "0%",
                transitionDuration: `${isThisPosting ? postingTransitionMs : 0}ms`,
              }}
            />

            <Box className="row">
              <Box className="cover">
                {option?.image_url_small ? (
                  <Box
                    component="img"
                    className="image"
                    src={option.image_url_small}
                    alt={option.name || option.title || "Cover"}
                  />
                ) : null}
              </Box>

              <Box className="texts">
                <Typography
                  className="title"
                  component="h3"
                  variant="h6"
                  noWrap
                  title={option?.name || option?.title || ""}
                >
                  {option?.name || option?.title || ""}
                </Typography>
                <Typography
                  className="artist"
                  component="p"
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  title={option?.artist || ""}
                >
                  {option?.artist || ""}
                </Typography>
              </Box>

              <Box className="action">
                <Button
                  className="action_button"
                  variant="contained"
                  size="small"
                  disabled={posting}
                  onClick={() => onSelectSong?.(option)}
                >
                  {isThisPosting ? (
                    <Box className="action_content">
                      <CircularProgress className="spinner" size={16} />
                      {actionLabel}
                    </Box>
                  ) : (
                    actionLabel
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
