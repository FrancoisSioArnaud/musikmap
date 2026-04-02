import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ModeCommentOutlinedIcon from "@mui/icons-material/ModeCommentOutlined";

export default function DepositComments({ comments, onOpen }) {
  const count = Array.isArray(comments?.items) ? comments.items.length : 0;

  return (
    <Box
      className="deposit_comments"
      aria-label="Voir les commentaires"
      role="button"
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onOpen?.();
        }
      }}
    >
      <ModeCommentOutlinedIcon />
      {count > 0 ? (
        <Typography component="span" variant="body2" className="count">
          {count}
        </Typography>
      ) : null}
    </Box>
  );
}
