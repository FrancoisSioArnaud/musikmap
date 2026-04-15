import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

const RESULT_COPY = {
  account_created: {
    title: "Ton compte a bien été créé",
    description: "Tu peux maintenant continuer et profiter de toutes les fonctionnalités de Boîte à Chanson.",
    continueLabel: "Continuer",
  },
  provider_linked: {
    title: "Ton compte Spotify a bien été rattaché à ton compte",
    description: "Tes résultats personnalisés Spotify sont maintenant disponibles.",
    continueLabel: "Continuer",
  },
  login_success: {
    title: "Connexion réussie",
    description: "Tu peux reprendre là où tu en étais.",
    continueLabel: "Continuer",
  },
  login_existing_required: {
    title: "Un compte existe déjà",
    description: "Connecte-toi à ton compte existant pour y rattacher Spotify et retrouver toutes tes données au même endroit.",
    continueLabel: "Me connecter à ce compte",
  },
  merge_required: {
    title: "Fusion des comptes requise",
    description: "Ce compte Spotify est déjà lié à un autre compte. Tu peux fusionner tes comptes pour continuer avec un seul profil.",
    continueLabel: "Fusionner mes comptes",
  },
  merge_success: {
    title: "Tes comptes ont bien été fusionnés",
    description: "Tu peux maintenant continuer avec un seul compte et retrouver toutes tes données au même endroit.",
    continueLabel: "Continuer",
  },
  error: {
    title: "Connexion Spotify impossible",
    description: "Une erreur est survenue pendant la connexion à Spotify.",
    continueLabel: "Retour",
  },
};

export default function AuthResultRouter({
  result = "error",
  email = "",
  onContinue,
  onBackToAuth,
  onMerge,
  onCancelMerge,
  submitting = false,
}) {
  const copy = RESULT_COPY[result] || RESULT_COPY.error;

  return (
    <Stack spacing={2}>
      <Typography variant="h3">{copy.title}</Typography>
      <Typography variant="body1">{copy.description}</Typography>
      {result === "login_existing_required" && email ? (
        <Typography variant="body2">Compte trouvé : {email}</Typography>
      ) : null}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {result === "merge_required" ? (
          <>
            <Button variant="contained" onClick={onMerge} disabled={submitting}>
              {submitting ? <CircularProgress size={20} /> : copy.continueLabel}
            </Button>
            <Button variant="outlined" onClick={onCancelMerge} disabled={submitting}>Annuler</Button>
          </>
        ) : (
          <Button variant="contained" onClick={onContinue} disabled={submitting}>
            {copy.continueLabel}
          </Button>
        )}
        {result === "login_existing_required" ? (
          <Button variant="outlined" onClick={onBackToAuth} disabled={submitting}>Créer un autre compte</Button>
        ) : null}
      </Box>
    </Stack>
  );
}
