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
      <Box className="song_search_results_loader">
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (!Array.isArray(results) || results.length === 0) {
    return emptyContent || null;
  }

  return (
    <List disablePadding className="song_search_results">
      {results.map((option) => {
        const id = option?.id ?? "__posting__";
        const isThisPosting = posting && postingId === id;

        return (
          <ListItem key={id} className="result_item">
            <Box
              aria-hidden="true"
              className="progress"
              sx={{
                width: isThisPosting ? `${postingProgress}%` : "0%",
                transitionDuration: `${isThisPosting ? postingTransitionMs : 0}ms`,
              }}
            />

            <Box className="content">
              <Box className="cover">
                {option?.image_url_small ? (
                  <Box
                    component="img"
                    src={option.image_url_small}
                    alt={option.name || "Cover"}
                    className="image"
                  />
                ) : null}
              </Box>

              <Box className="texts">
                <Typography
                  component="h3"
                  variant="h6"
                  noWrap
                  className="title"
                  title={option?.name || ""}
                >
                  {option?.name || ""}
                </Typography>
                <Typography
                  component="p"
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  className="artist"
                  title={option?.artist || ""}
                >
                  {option?.artist || ""}
                </Typography>
              </Box>

              <Box className="action">
                <Button
                  variant="contained"
                  size="small"
                  disabled={posting}
                  onClick={() => onAction?.(option)}
                  className="action_button"
                >
                  {isThisPosting ? (
                    <Box className="action_content loading">
                      <CircularProgress
                        size={16}
                        className="action_spinner"
                        sx={{ color: "var(--mm-color-primary-contrast-text)" }}
                      />
                      {actionLabel}
                    </Box>
                  ) : (
                    <Box className="action_content">{actionLabel}</Box>
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
