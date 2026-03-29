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

      {article?.cover_image ? (
        <Box
        component="img"
        src={article.cover_image}
        alt={article?.title || "Illustration article"}
        className="image"
        sx={{width:"100%"}}
        />
      ) : null}

      <Box className="text">
        {article?.title ? (
          <Typography component="h1" variant="h2" className="title">
            {article.title}
          </Typography>
        ) : null}

        {article?.short_text ? (
          <Typography component="div" variant="body1" className="text">
            {article.short_text}
          </Typography>
        ) : null}
      </Box>


      <Button variant="contained" onClick={onClose} className="bottom_fixed">
        Fermer
      </Button>


    </Drawer>
  );
}
