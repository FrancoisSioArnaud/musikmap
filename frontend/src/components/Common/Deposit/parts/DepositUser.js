import React from "react";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

import UserInline from "../../UserInline";

export default function DepositUser({ user, onNavigateProfile }) {
  return (
    <Box className="deposit_user">
      <Typography variant="body1" component="span" sx={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>Partagée par</Typography>
      <UserInline
        user={user}
        className="deposit_user"
        avatarSize={32}
      />
    </Box>
  );
}
