import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React from "react";

export default function DepositUser({ user, userPrefix = "Partagée par", onNavigateProfile }) {
  const canNavigate = Boolean(user?.username && !user?.is_guest);

  return (
    <Box
      onClick={() => {
        if (canNavigate) {onNavigateProfile?.(user.username);}
      }}
      className={canNavigate ? "hasUsername deposit_user" : "deposit_user"}
    >
      <Typography variant="body1" component="span">
        {userPrefix}
      </Typography>
      <Box className="avatarbox">
        <Avatar
          src={user?.profile_picture_url || undefined}
          alt={user?.display_name || "anonyme"}
          className="avatar"
        />
      </Box>
      <Typography component="span" className="username" variant="subtitle1">
        {user?.display_name || "anonyme"}
        {canNavigate ? (
          <ArrowForwardIosIcon className="icon" sx={{ height: "0.8em", width: "0.8em" }} />
        ) : null}
      </Typography>
    </Box>
  );
}
