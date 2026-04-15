import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import AuthResultRouter from "./AuthResultRouter";
import { clearAuthReturnContext, getAuthSuccessTarget } from "./AuthFlow";

export default function AuthReturnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const result = searchParams.get("result") || "error";
  const email = searchParams.get("email") || "";

  const handleContinue = () => {
    if (result === "login_existing_required") {
      navigate("/auth?tab=login&context=account", { replace: true });
      return;
    }
    const target = getAuthSuccessTarget({ fallback: "/profile" });
    navigate(target, { replace: true });
  };

  const handleBackToAuth = async () => {
    try {
      await fetch("/spotify/clear-pending-auth", { method: "POST", credentials: "same-origin" });
    } catch (_error) {}
    clearAuthReturnContext();
    navigate("/auth?tab=register&context=account", { replace: true });
  };

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Card variant="outlined">
        <CardContent>
          <AuthResultRouter
            result={result}
            email={email}
            onContinue={handleContinue}
            onBackToAuth={handleBackToAuth}
          />
        </CardContent>
      </Card>
    </Container>
  );
}
