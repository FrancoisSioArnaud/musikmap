import Button from "@mui/material/Button";
import React from "react";

export default function FollowButton({ isFollowed, loading, onClick }) {
  return (
    <Button variant={isFollowed ? "outlined" : "contained"} size="small" disabled={loading} onClick={onClick}>
      {isFollowed ? "Suivi" : "Suivre"}
    </Button>
  );
}
