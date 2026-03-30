import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableHead from "@mui/material/TableHead";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import IconButton from "@mui/material/IconButton";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import { getCookie } from "../Security/TokensUtils";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
}

function getCountLabel(items) {
  const count = items.length;
  return `${count} phrase${count > 1 ? "s" : ""}`;
}

export default function IncitationsList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const response = await fetch("/box-management/client-admin/incitations/", {
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => ([]));

      if (!response.ok) {
        throw new Error(data?.detail || "Impossible de charger les phrases d’incitation.");
      }

      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      setPageError(error.message || "Impossible de charger les phrases d’incitation.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const countLabel = useMemo(() => getCountLabel(items), [items]);

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    setDeleteLoading(true);
    setPageError("");

    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch(
        `/box-management/client-admin/incitations/${itemToDelete.id}/`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "X-CSRFToken": csrftoken,
          },
        }
      );

      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.detail || "Suppression impossible.");
      }

      setItems((prev) => prev.filter((item) => item.id !== itemToDelete.id));
      setItemToDelete(null);
    } catch (error) {
      setPageError(error.message || "Suppression impossible.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Box>
            <Typography variant="h4" gutterBottom>
              Mes phrases d’incitation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Définis la phrase affichée sous la barre de recherche dans Flowbox.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            component={RouterLink}
            to="/client/incitation/new"
          >
            Nouvelle phrase
          </Button>
        </Stack>
      </Paper>

      {pageError ? <Alert severity="error">{pageError}</Alert> : null}

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            px: 2.5,
            py: 2,
            borderBottom: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {countLabel}
          </Typography>

          <Button variant="outlined" onClick={fetchItems}>
            Actualiser
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography variant="body1">Aucune phrase d’incitation.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Phrase</TableCell>
                  <TableCell>Période</TableCell>
                  <TableCell>État</TableCell>
                  <TableCell>Chevauchement</TableCell>
                  <TableCell>Créée le</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => {
                  const isPast = !!item?.is_past;
                  const overlapCount = Number(item?.overlap_count || 0);

                  return (
                    <TableRow hover key={item.id}>
                      <TableCell sx={{ minWidth: 320 }}>
                        <Stack spacing={1}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CampaignRoundedIcon color="primary" fontSize="small" />
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {item.text}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            Client : {item.client_slug || "default"}
                          </Typography>
                        </Stack>
                      </TableCell>

                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ color: isPast ? "error.main" : "text.primary", fontWeight: 600 }}
                        >
                          {item.period_label || `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`}
                        </Typography>
                      </TableCell>

                      <TableCell>
                        {item.is_active_now ? (
                          <Chip size="small" color="success" label="En cours" />
                        ) : item.is_future ? (
                          <Chip size="small" color="info" label="À venir" />
                        ) : (
                          <Chip size="small" color="default" label="Passée" />
                        )}
                      </TableCell>

                      <TableCell>
                        {overlapCount > 0 ? (
                          <Chip
                            size="small"
                            color="warning"
                            label={`Attention : se superpose (${overlapCount})`}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>

                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(item.created_at).toLocaleString("fr-FR")}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Modifier">
                            <IconButton
                              color="primary"
                              onClick={() => navigate(`/client/incitation/${item.id}`)}
                            >
                              <EditRoundedIcon />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Supprimer">
                            <IconButton
                              color="error"
                              onClick={() => setItemToDelete(item)}
                            >
                              <DeleteOutlineRoundedIcon />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog
        open={!!itemToDelete}
        onClose={() => (deleteLoading ? null : setItemToDelete(null))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Supprimer cette phrase ?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Cette phrase d’incitation sera supprimée définitivement.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)} disabled={deleteLoading}>
            Annuler
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDeleteConfirm}
            disabled={deleteLoading}
          >
            {deleteLoading ? "Suppression…" : "Supprimer"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
