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
      <Box className="song_search_loading">
        <CircularProgress className="spinner" size={28} />
      </Box>
    );
  }

  if (!Array.isArray(results) || results.length === 0) {
    return emptyContent || null;
  }

  return (
    <List className="song_search_results" disablePadding>
      {results.map((option) => {
        const id = option?.id ?? "__posting__";
        const isThisPosting = posting && postingId === id;

        return (
          <ListItem className="item" key={id}>
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
                    alt={option.name || "Cover"}
                  />
                ) : null}
              </Box>

              <Box className="texts">
                <Typography
                  className="title"
                  component="h3"
                  variant="h6"
                  noWrap
                  title={option?.name || ""}
                >
                  {option?.name || ""}
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
                  onClick={() => onAction?.(option)}
                >
                  {isThisPosting ? (
                    <Box className="action_content">
                      <CircularProgress
                        className="spinner"
                        size={16}
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
