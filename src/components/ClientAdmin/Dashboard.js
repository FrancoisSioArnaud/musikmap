import React, { useContext, useMemo } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import ArticleRoundedIcon from "@mui/icons-material/ArticleRounded";
import Inventory2RoundedIcon from "@mui/icons-material/Inventory2Rounded";
import { UserContext } from "../UserContext";

function getClientName(user) {
  return user?.client_name || user?.client?.name || "Client";
}

export default function Dashboard() {
  const { user } = useContext(UserContext);

  const clientName = useMemo(() => getClientName(user), [user]);

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Tableau de bord
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Cet espace affichera ensuite les statistiques liées aux boîtes du client.
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip icon={<InsightsRoundedIcon />} label="Stats à venir" color="primary" />
            <Chip icon={<Inventory2RoundedIcon />} label={clientName} variant="outlined" />
          </Stack>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="h6" gutterBottom>
          État actuel
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <Stack spacing={1.25}>
          <Typography variant="body1">
            Le dashboard est volontairement vide pour l’instant.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            La prochaine étape logique sera d’y afficher les stats des boîtes rattachées
            au client.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            En attendant, la gestion des articles est déjà disponible dans la section
            “Mes articles”.
          </Typography>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ArticleRoundedIcon color="primary" />
          <Box>
            <Typography variant="h6">Gestion des articles</Typography>
            <Typography variant="body2" color="text.secondary">
              Crée, modifie, publie, archive ou supprime les previews d’articles
              externes.
            </Typography>
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
}
