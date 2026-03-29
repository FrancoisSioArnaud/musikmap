import React from "react";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function ArticleDrawer({ article, open, onClose }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ className: "drawer_paper" }}
      className="drawer"
    >
      <Box className="drawer_content">
        {article?.cover_image ? (
          <Box
            component="img"
            src={article.cover_image}
            alt={article?.title || "Illustration article"}
            className="image"
          />
        ) : null}

        {article?.title ? (
          <Typography component="h2" variant="h2" className="title">
            {article.title}
          </Typography>
        ) : null}

        {article?.short_text ? (
          <Typography component="div" variant="body1" className="text">
            {article.short_text}
          </Typography>
        ) : null}

        <Box className="actions">
          <Button variant="contained" onClick={onClose} className="bottom_fixed">
            Fermer
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
