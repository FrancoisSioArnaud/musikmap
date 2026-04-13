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
      <Box className="song_search_results song_search_results--loading">
        <CircularProgress className="song_search_results__loading_spinner" size={28} />
      </Box>
    );
  }

  if (!Array.isArray(results) || results.length === 0) {
    return emptyContent || null;
  }

  return (
    <List className="song_search_results song_search_results__list" disablePadding>
      {results.map((option) => {
        const id = option?.id ?? "__posting__";
        const isThisPosting = posting && postingId === id;

        return (
          <ListItem
            key={id}
            className={`song_search_results__item${isThisPosting ? " song_search_results__item--posting" : ""}`}
            style={{
              "--search-result-progress": `${isThisPosting ? postingProgress : 0}%`,
              "--search-result-transition-duration": `${isThisPosting ? postingTransitionMs : 0}ms`,
            }}
          >
            <Box aria-hidden="true" className="song_search_results__progress" />

            <Box className="song_search_results__content">
              <Box className="song_search_results__cover">
                {option?.image_url_small ? (
                  <Box
                    component="img"
                    className="song_search_results__cover_image"
                    src={option.image_url_small}
                    alt={option.name || "Cover"}
                  />
                ) : null}
              </Box>

              <Box className="song_search_results__texts">
                <Typography
                  className="song_search_results__title"
                  component="h3"
                  variant="h6"
                  noWrap
                  title={option?.name || ""}
                >
                  {option?.name || ""}
                </Typography>
                <Typography
                  className="song_search_results__artist"
                  component="p"
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  title={option?.artist || ""}
                >
                  {option?.artist || ""}
                </Typography>
              </Box>

              <Box className="song_search_results__action">
                <Button
                  className="song_search_results__button"
                  variant="contained"
                  size="small"
                  disabled={posting}
                  onClick={() => onAction?.(option)}
                >
                  {isThisPosting ? (
                    <Box className="song_search_results__button_content">
                      <CircularProgress className="song_search_results__button_spinner" size={16} />
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
