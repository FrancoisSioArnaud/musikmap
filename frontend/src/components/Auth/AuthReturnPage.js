import Alert from "@mui/material/Alert";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";


import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { checkUserStatus } from "../UsersUtils";

import { clearAuthReturnContext, getAuthSuccessTarget } from "./AuthFlow";
import AuthResultRouter from "./AuthResultRouter";

export default function AuthReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser, setIsAuthenticated } = useContext(UserContext);

  const [result, setResult] = useState(searchParams.get("result") || "error");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const syncPendingState = async () => {
      if (result !== "merge_required" && result !== "login_existing_required") {return;}
      try {
        const response = await fetch("/spotify/pending-auth-status", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled || !response.ok || !data?.pending) {return;}
        if (data.type) {setResult(data.type);}
        if (data.email) {setEmail(data.email);}
      } catch (_error) {}
    };
    syncPendingState();
    return () => {
      cancelled = true;
    };
  }, [result]);

  const handleContinue = () => {
    if (result === "login_existing_required") {
      navigate("/auth?tab=login&context=account", { replace: true });
      return;
    }
    const target = getAuthSuccessTarget({ fallback: "/profile" });
    clearAuthReturnContext();
    navigate(target, { replace: true });
  };

  const handleBackToAuth = async () => {
    try {
      await fetch("/spotify/clear-pending-auth", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
      });
    } catch (_error) {}
    clearAuthReturnContext();
    navigate("/auth?tab=register&context=account", { replace: true });
  };

  const handleMerge = async () => {
    setSubmitting(true);
    setErrorMessage("");
    try {
      const response = await fetch("/spotify/resolve-pending-auth", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ action: "merge" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(data?.detail || "Impossible de fusionner les comptes.");
        return;
      }
      await checkUserStatus(setUser, setIsAuthenticated);
      setResult(data?.result || "merge_success");
    } catch (_error) {
      setErrorMessage("Impossible de fusionner les comptes.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMerge = async () => {
    setSubmitting(true);
    setErrorMessage("");
    try {
      await fetch("/spotify/resolve-pending-auth", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ action: "cancel" }),
      });
    } catch (_error) {}
    const target = getAuthSuccessTarget({ fallback: "/profile" });
    navigate(target, { replace: true });
    setSubmitting(false);
  };

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2}>
            {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
            <AuthResultRouter
              result={result}
              email={email}
              onContinue={handleContinue}
              onBackToAuth={handleBackToAuth}
              onMerge={handleMerge}
              onCancelMerge={handleCancelMerge}
              submitting={submitting}
            />
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
