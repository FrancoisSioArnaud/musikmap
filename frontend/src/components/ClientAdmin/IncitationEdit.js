import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Snackbar from "@mui/material/Snackbar";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Chip from "@mui/material/Chip";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { getCookie } from "../Security/TokensUtils";

const EMPTY_FORM = {
  text: "",
  start_date: "",
  end_date: "",
};

function normalizeForm(data) {
  if (!data || typeof data !== "object") return EMPTY_FORM;
  return {
    text: data.text || "",
    start_date: data.start_date || "",
    end_date: data.end_date || "",
  };
}

export default function IncitationEdit() {
  const navigate = useNavigate();
  const { incitationId } = useParams();
  const isCreate = !incitationId;

  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarText, setSnackbarText] = useState("");
  const [overlapDialogOpen, setOverlapDialogOpen] = useState(false);
  const [overlapItems, setOverlapItems] = useState([]);

  const patchForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const showSnackbar = (text) => {
    setSnackbarText(text);
    setSnackbarOpen(true);
  };

  useEffect(() => {
    if (isCreate) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setPageError("");

      try {
        const response = await fetch(
          `/box-management/client-admin/incitations/${incitationId}/`,
          { credentials: "same-origin" }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.detail || "Impossible de charger la phrase d’incitation.");
        }

        if (cancelled) return;
        setForm(normalizeForm(data));
      } catch (error) {
        if (cancelled) return;
        setPageError(error.message || "Impossible de charger la phrase d’incitation.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [incitationId, isCreate]);

  const periodSummary = useMemo(() => {
    if (!form.start_date || !form.end_date) {
      return "Choisis une période complète en jours pleins.";
    }
    return `La phrase sera affichée du ${form.start_date} au ${form.end_date} inclus.`;
  }, [form.start_date, form.end_date]);

  const submit = useCallback(async (forceOverlap = false) => {
    setSaving(true);
    setPageError("");

    try {
      const url = isCreate
        ? "/box-management/client-admin/incitations/"
        : `/box-management/client-admin/incitations/${incitationId}/`;
      const method = isCreate ? "POST" : "PATCH";
      const csrftoken = getCookie("csrftoken");

      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify({
          text: form.text,
          start_date: form.start_date,
          end_date: form.end_date,
          force_overlap: forceOverlap,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data?.error === "overlap_warning") {
        setOverlapItems(Array.isArray(data?.overlaps) ? data.overlaps : []);
        setOverlapDialogOpen(true);
        return;
      }

      if (!response.ok) {
        if (data && typeof data === "object") {
          const firstKey = Object.keys(data)[0];
          const firstValue = data[firstKey];
          const detail = Array.isArray(firstValue) ? firstValue[0] : firstValue;
          throw new Error(detail || data?.detail || "Enregistrement impossible.");
        }
        throw new Error("Enregistrement impossible.");
      }

      showSnackbar(isCreate ? "Phrase créée." : "Phrase enregistrée.");

      if (isCreate && data?.id) {
        navigate(`/client/incitation/${data.id}`, { replace: true });
      }
    } catch (error) {
      setPageError(error.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }, [form, incitationId, isCreate, navigate]);

  const handleDelete = async () => {
    if (isCreate || saving) return;

    setSaving(true);
    setPageError("");

    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch(
        `/box-management/client-admin/incitations/${incitationId}/`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "X-CSRFToken": csrftoken },
        }
      );

      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.detail || "Suppression impossible.");
      }

      navigate("/client/incitation", { replace: true });
    } catch (error) {
      setPageError(error.message || "Suppression impossible.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 980, mx: "auto" }}>
      <Stack spacing={3}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Button
            variant="text"
            startIcon={<ArrowBackRoundedIcon />}
            onClick={() => navigate("/client/incitation")}
            disabled={saving}
          >
            Retour aux phrases d’incitation
          </Button>

          {!isCreate ? (
            <Chip size="small" label="Modification" />
          ) : null}
        </Stack>

        {pageError ? <Alert severity="error">{pageError}</Alert> : null}

        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="h4">
                {isCreate ? "Nouvelle phrase d’incitation" : "Modifier la phrase d’incitation"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Cette phrase s’affichera sous la barre de recherche de Flowbox pendant la période choisie.
              </Typography>
            </Stack>

            <Divider />

            <Stack spacing={2}>
              <TextField
                label="Phrase d’incitation"
                value={form.text}
                onChange={(event) => patchForm("text", event.target.value)}
                fullWidth
                required
                placeholder="C’est la semaine du carnaval, partage une chanson qui te donne envie de faire la fête"
                helperText={`${form.text.length}/100 caractères`}
                inputProps={{ maxLength: 100 }}
              />

              <Alert severity="info">
                Exemple : C’est la semaine du carnaval, partage une chanson qui te donne envie de faire la fête
              </Alert>
            </Stack>

            <Divider />

            <Stack spacing={2}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Période d’affichage
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Date de début"
                  type="date"
                  value={form.start_date}
                  onChange={(event) => patchForm("start_date", event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  required
                />
                <TextField
                  label="Date de fin"
                  type="date"
                  value={form.end_date}
                  onChange={(event) => patchForm("end_date", event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  required
                />
              </Stack>

              <Alert severity="info">{periodSummary}</Alert>
            </Stack>

            <Divider />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              justifyContent="flex-end"
            >
              <Button
                variant="outlined"
                onClick={() => navigate("/client/incitation")}
                disabled={saving}
              >
                Annuler
              </Button>

              {!isCreate ? (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Supprimer
                </Button>
              ) : null}

              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={() => submit(false)}
                disabled={saving}
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>

      <Dialog
        open={overlapDialogOpen}
        onClose={() => (saving ? null : setOverlapDialogOpen(false))}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>La période se superpose</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Cette phrase se superpose avec une ou plusieurs phrases existantes. Tu peux quand même l’enregistrer si tu confirmes.
          </DialogContentText>

          <Stack spacing={1.25}>
            {overlapItems.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {item.text}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.period_label}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOverlapDialogOpen(false);
                    }}
            disabled={saving}
          >
            Modifier
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              setOverlapDialogOpen(false);
              await submit(true);
            }}
            disabled={saving}
          >
            Confirmer quand même
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarText}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </Box>
  );
}
