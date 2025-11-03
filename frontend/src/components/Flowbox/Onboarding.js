// frontend/src/components/Flowbox/Onboarding.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

/**
 * Onboarding :
 * - Page d'entrée du Flowbox.
 * - Loader centré pendant la requête GET /api/get-box.get?slug=<boxSlug>.
 * - À la réponse : affiche le hero (même structure que MusicBox) + bouton "Entrer dans la boîte".
 */

const ENDPOINTS = [
  (slug) => `/api/get-box.get?slug=${encodeURIComponent(slug)}`,
  // (slug) => `/api/box-management/get-box.get?slug=${encodeURIComponent(slug)}`,
  // (slug) => `/api/box/get-box.get?slug=${encodeURIComponent(slug)}`,
];

export default function Onboarding() {
  const { boxSlug } = useParams();
  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  console.log("[Onboarding] render slug=", boxSlug);
  useEffect(() => {
    let aborted = false;
    const ctrl = new AbortController();

    async function fetchBox() {
      setLoading(true);
      setErr(null);

      for (const buildUrl of ENDPOINTS) {
        const url = buildUrl(boxSlug);
        try {
          const res = await fetch(url, { signal: ctrl.signal, credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();

          const b = data?.box ?? data;
          if (!b || typeof b !== "object" || !b.name) throw new Error("Payload inattendu");

          if (!aborted) {
            setBox(b);
            setLoading(false);
          }
          return;
        } catch {
          if (aborted) return;
        }
      }

      if (!aborted) {
        setErr("Impossible de récupérer la boîte. Vérifie l’endpoint get-box.get.");
        setLoading(false);
      }
    }

    fetchBox();
    return () => {
      aborted = true;
      ctrl.abort();
    };
  }, [boxSlug]);

  const heroBg = useMemo(() => {
    const url = box?.image_url || box?.image || null;
    return url ? `url("${url}")` : "linear-gradient(180deg, #111 0%, #000 100%)";
  }, [box]);

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          p: 2,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <CircularProgress size={56} />
          <Typography variant="body1" color="text.secondary">
            Chargement de la boîte…
          </Typography>
        </Box>
      </Box>
    );
  }

  if (err) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
        <Box sx={{ width: "min(720px, 100%)", mx: "auto" }}>
          <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </Box>
      </Box>
    );
  }

  // ====== HERO (structure proche de MusicBox.js) ======
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        className="flowbox-hero"
        sx={{
          position: "relative",
          height: { xs: 320, sm: 420, md: 480 },
          display: "flex",
          alignItems: "flex-end",
          backgroundImage: heroBg,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: 0,
          overflow: "hidden",
        }}
      >
        {/* Overlay dégradé */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.0) 100%)",
          }}
        />

        {/* Contenu texte */}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            px: 2,
            pb: 3,
            maxWidth: 1200,
            mx: "auto",
          }}
        >
          {box?.client_name && (
            <Box
              className="hero-client-badge"
              sx={{
                display: "inline-flex",
                alignItems: "center",
                px: 1.25,
                py: 0.5,
                mb: 1,
                borderRadius: "999px",
                bgcolor: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(2px)",
              }}
            >
              <Typography variant="caption" sx={{ color: "#fff", letterSpacing: 0.4 }}>
                {box.client_name}
              </Typography>
            </Box>
          )}

          <Typography
            variant="h4"
            component="h1"
            sx={{
              color: "#fff",
              fontWeight: 700,
              textShadow: "0 2px 14px rgba(0,0,0,0.4)",
            }}
          >
            {box?.name || "Boîte musicale"}
          </Typography>

          {box?.description && (
            <Typography
              variant="body1"
              sx={{
                mt: 0.75,
                maxWidth: 780,
                color: "rgba(255,255,255,0.92)",
                textShadow: "0 1px 8px rgba(0,0,0,0.35)",
              }}
            >
              {box.description}
            </Typography>
          )}

          {/* === BOUTON ENTRER DANS LA BOÎTE === */}
          <Box sx={{ mt: 3 }}>
            <Button
              variant="contained"
              size="large"
              color="primary"
              sx={{
                px: 4,
                py: 1.25,
                fontWeight: 600,
                borderRadius: "8px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
              }}
              onClick={() => {
                // 🔹 On ajoutera ici la navigation vers /flowbox/:boxSlug/main
                console.log("TODO: Naviguer vers /flowbox/" + boxSlug + "/main");
              }}
            >
              Entrer dans la boîte
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
