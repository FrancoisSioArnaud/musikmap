import React, { useContext, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Container from "@mui/material/Container";
import { UserContext } from "./UserContext";
import AuthPanel from "./Common/AuthPanel";
import { clearAuthReturnContext, getAuthReturnContext, getAuthSuccessTarget } from "./Common/authFlow";

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, authChecked } = useContext(UserContext);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    const stored = getAuthReturnContext();
    if (!stored?.action) {
      clearAuthReturnContext();
    }
    navigate(getAuthSuccessTarget({ fallback: "/profile", locationState: location.state }), { replace: true });
  }, [authChecked, isAuthenticated, location.state, navigate]);

  if (!authChecked) return null;
  if (isAuthenticated) return null;

  return (
    <Container component="main" maxWidth="sm">
      <AuthPanel
        mode="page"
        initialTab={searchParams.get("tab") || "register"}
        authContext={searchParams.get("context") || "default"}
        mergeGuest={searchParams.get("merge_guest") === "1"}
        prefillUsername={(searchParams.get("prefill_username") || "").trim()}
        providerError={searchParams.get("social_auth") === "error" ? "Connexion Spotify impossible. Réessaie dans un instant." : ""}
      />
    </Container>
  );
}
