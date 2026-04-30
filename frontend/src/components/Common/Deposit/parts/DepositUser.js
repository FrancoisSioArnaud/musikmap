import React from "react";

import UserInline from "../../UserInline";

export default function DepositUser({ user, userPrefix = "Partagée par", onNavigateProfile }) {
  return (
    <UserInline
      user={user}
      prefix={userPrefix}
      className="deposit_user"
      avatarSize={32}
    />
  );
}
