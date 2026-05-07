import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import Button from "@mui/material/Button";
import React from "react";

export default function DepositLink({ canShare, isSharing, onShare }) {
  if (!canShare) {return null;}

  const isApplePlatform =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod|Macintosh|MacIntel|MacPPC|Mac68K/.test(
      navigator.platform || navigator.userAgent || ""
    );
  const ShareIcon = isApplePlatform ? IosShareRoundedIcon : ShareRoundedIcon;

  return (
    <Button
      variant="depositInteract"
      className="deposit_action_button share_button"
      onClick={onShare}
      aria-label="Partager"
      title="Partager"
      disabled={isSharing}
    >
      <ShareIcon />
    </Button>
  );
}
