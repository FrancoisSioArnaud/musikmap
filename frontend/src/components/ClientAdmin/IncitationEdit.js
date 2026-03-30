import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Snackbar from "@mui/material/Snackbar";
import Chip from "@mui/material/Chip";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { getCookie } from "../Security/TokensUtils";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function normalizeForm(data = {}) {
  return {
    text: typeof data?.text === "string" ? data.text : "",
    start_date: data?.start_date || "",
    end_date: data?.end_date || "",
  };
}

function parseDate(dateString) {
  if (!dateString) return null;
  const [year, month, day] = String(dateString).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatHumanDate(value) {
  if (!value) return "—";
  const date = parseDate(value);
  if (!date) return value;
  return date.toLocaleDateString("fr-FR");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(monthDate) {
  const firstDay = startOfMonth(monthDate);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return date;
  });
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return formatDateKey(a) === formatDateKey(b);
}

function isWithinRange(date, start, end) {
  if (!start || !end) return false;
  return date >= start && date <= end;
}

export default function IncitationEdit() {
  const navigate = useNavigate();
  const { incitationId } = useParams();
  const isCreate = !incitationId || incitationId === "new";

  const [form, setForm] = useState({ text: "", start_date: "", end_date: "" });
  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [overlapDialogOpen, setOverlapDialogOpen] = useState(false);
  const [overlapItems, setOverlapItems] = useState([]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarText, setSnackbarText] = useState("");
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

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
        const normalized = normalizeForm(data);
        setForm(normalized);
        if (normalized.start_date) {
          setCurrentMonth(startOfMonth(parseDate(normalized.start_date) || new Date()));
        }
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

  const startDateObj = useMemo(() => parseDate(form.start_date), [form.start_date]);
  const endDateObj = useMemo(() => parseDate(form.end_date), [form.end_date]);
  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);

  const periodSummary = useMemo(() => {
    if (!form.start_date || !form.end_date) {
      return "Clique une première fois pour choisir le début, puis une deuxième fois pour choisir la fin.";
    }
    return `La phrase sera affichée du ${formatHumanDate(form.start_date)} au ${formatHumanDate(form.end_date)} inclus.`;
  }, [form.start_date, form.end_date]);

  const handleCalendarDayClick = (date) => {
    const key = formatDateKey(date);

    if (!form.start_date || (form.start_date && form.end_date)) {
      setForm((prev) => ({ ...prev, start_date: key, end_date: "" }));
      return;
    }

    if (form.start_date && !form.end_date) {
      const start = parseDate(form.start_date);
      if (!start) {
        setForm((prev) => ({ ...prev, start_date: key, end_date: "" }));
        return;
      }

      if (date < start) {
        setForm((prev) => ({ ...prev, start_date: key, end_date: form.start_date }));
        return;
      }

      setForm((prev) => ({ ...prev, end_date: key }));
    }
  };

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

          {!isCreate ? <Chip size="small" label="Modification" /> : null}
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
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
              >
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Période d’affichage
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Premier clic : début. Deuxième clic : fin.
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ChevronLeftRoundedIcon />}
                    onClick={() => setCurrentMonth((prev) => addMonths(prev, -1))}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    endIcon={<ChevronRightRoundedIcon />}
                    onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
                  >
                    Suivant
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setForm((prev) => ({ ...prev, start_date: "", end_date: "" }))}
                    disabled={!form.start_date && !form.end_date}
                  >
                    Effacer
                  </Button>
                </Stack>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Chip
                  label={`Début : ${formatHumanDate(form.start_date)}`}
                  color={form.start_date ? "primary" : "default"}
                  variant={form.start_date ? "filled" : "outlined"}
                />
                <Chip
                  label={`Fin : ${formatHumanDate(form.end_date)}`}
                  color={form.end_date ? "primary" : "default"}
                  variant={form.end_date ? "filled" : "outlined"}
                />
              </Stack>

              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ px: 0.5, pb: 1.5 }}
                >
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {currentMonth.toLocaleDateString("fr-FR", {
                      month: "long",
                      year: "numeric",
                    })}
                  </Typography>
                </Stack>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                    gap: 1,
                  }}
                >
                  {WEEKDAY_LABELS.map((label) => (
                    <Box key={label} sx={{ px: 1, py: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
                        {label}
                      </Typography>
                    </Box>
                  ))}

                  {calendarDays.map((date) => {
                    const dateKey = formatDateKey(date);
                    const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                    const isStart = isSameDay(date, startDateObj);
                    const isEnd = isSameDay(date, endDateObj);
                    const inRange = isWithinRange(date, startDateObj, endDateObj);
                    const isSingle = isStart && isEnd;

                    return (
                      <Button
                        key={dateKey}
                        variant="text"
                        onClick={() => handleCalendarDayClick(date)}
                        sx={{
                          minHeight: { xs: 52, sm: 68 },
                          borderRadius: 2,
                          border: "1px solid",
                          borderColor: isStart || isEnd ? "primary.main" : "divider",
                          backgroundColor: isSingle || isStart || isEnd
                            ? "primary.main"
                            : inRange
                              ? "action.selected"
                              : "transparent",
                          color: isSingle || isStart || isEnd ? "#fff" : "text.primary",
                          opacity: isCurrentMonth ? 1 : 0.45,
                          '&:hover': {
                            backgroundColor: isSingle || isStart || isEnd
                              ? "primary.main"
                              : inRange
                                ? "action.selected"
                                : "action.hover",
                          },
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: isStart || isEnd ? 700 : 500,
                            color: isSingle || isStart || isEnd ? "#fff" : "text.primary",
                          }}
                        >
                          {date.getDate()}
                        </Typography>
                      </Button>
                    );
                  })}
                </Box>
              </Paper>

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
