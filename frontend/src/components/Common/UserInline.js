import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React from "react";
import { useNavigate } from "react-router-dom";

function UserInline({
  user,
  subtitle,
  onClick,
  onNavigateProfile,
  prefix,
  className = "",
  avatarSize = 26,
  interactive = true,
}) {
  const navigate = useNavigate();

  const username = (user?.username || "").trim();
  const displayName = (user?.display_name || user?.displayName || username || "anonyme").trim() || "anonyme";
  const canAutoNavigate = interactive && !onClick && Boolean(username && !user?.is_guest);
  const hasAction = interactive && Boolean(onClick || canAutoNavigate);
  subtitle = typeof subtitle === "string" ? subtitle.trim() : "";

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    if (!canAutoNavigate) {return;}

    if (onNavigateProfile) {
      onNavigateProfile(username);
      return;
    }

    navigate(`/profile/${username}`);
  };

  return (
    <Box
      component={hasAction ? "button" : "div"}
      type={hasAction ? "button" : undefined}
      onClick={handleClick}
      className={`${username ? "hasUsername " : ""}${className}`.trim() || undefined}
      sx={{
        all: "unset",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        cursor: hasAction ? "pointer" : "default",
        "&:active": hasAction ? { opacity: 0.92 } : undefined,
      }}
    >

      <Box className="avatarbox" sx={{ flex: "0 0 auto" }}>
        <Avatar
          src={user?.profile_picture_url || undefined}
          alt={displayName}
          className="avatar"
          sx={{ width: avatarSize, height: avatarSize }}
        />
      </Box>

      <Box sx={{ flex: "1 1 auto", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
        <Typography
          component="span"
          className="username"
          variant="subtitle1"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            minWidth: 0,
            maxWidth: "100%",
            whiteSpace: "nowrap",
          }}
        >
          <Box
            component="span"
            sx={{
              display: "block",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </Box>
          {canAutoNavigate ? <ArrowForwardIosIcon className="icon" sx={{ height: "0.8em", width: "0.8em", flex: "0 0 auto" }} /> : null}
        </Typography>

        {subtitle ? (
          <Typography
            variant="body2"
            className="click_delete"
            sx={{
              opacity: "var(--mm-opacity-light-text)",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

export default React.memo(UserInline);
