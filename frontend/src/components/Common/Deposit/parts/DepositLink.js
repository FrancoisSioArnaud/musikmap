import SendIcon from "@mui/icons-material/SendRounded";
import Button from "@mui/material/Button";
import React from "react";

export default function DepositLink({ canShare, isSharing, onShare }) {
  if (!canShare) {return null;}

  return (
    <Button
      variant="depositInteract"
      className="deposit_action_button share_button"
      onClick={onShare}
      aria-label="Partager"
      title="Partager"
      disabled={isSharing}
    >
      <SendIcon />
    </Button>
  );
}
