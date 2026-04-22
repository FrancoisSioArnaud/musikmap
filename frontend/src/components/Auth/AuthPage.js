import Container from "@mui/material/Container";
import React, { useContext, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { UserContext } from "../UserContext";

import { clearAuthReturnContext, getAuthReturnContext, getAuthSuccessTarget } from "./AuthFlow";
import AuthPanel from "./AuthPanel";

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, authChecked } = useContext(UserContext);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) {return;}
    const stored = getAuthReturnContext();
    const target = getAuthSuccessTarget({ fallback: "/profile", locationState: location.state });
    if (!stored?.action) {
      clearAuthReturnContext();
    }
    navigate(target, { replace: true });
  }, [authChecked, isAuthenticated, location.state, navigate]);

  if (!authChecked || isAuthenticated) {
    return null;
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <AuthPanel
        mode="page"
        initialTab={searchParams.get("tab") || "register"}
        authContext={searchParams.get("context") || "default"}
        mergeGuest={searchParams.get("merge_guest") === "1"}
        prefillUsername={searchParams.get("prefill_username") || ""}
        providerError={searchParams.get("social_auth") === "error" ? "Connexion Spotify impossible." : ""}
      />
    </Container>
  );
}
