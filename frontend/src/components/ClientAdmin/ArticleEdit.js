import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import PublicIcon from "@mui/icons-material/Public";

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toInputTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function buildWindowSummary(form) {
  const hasDate =
    !!form.display_date_start || !!form.display_date_end;
  const hasTime =
    !!form.display_time_start || !!form.display_time_end;

  if (!hasDate && !hasTime) return "Aucune restriction d’affichage";

  const parts = [];

  if (hasDate) {
    const start = form.display_date_start || "début";
    const end = form.display_date_end || "sans fin";
    parts.push(`Dates : ${start} → ${end}`);
  }

  if (hasTime) {
    const start = form.display_time_start || "00:00";
    const end = form.display_time_end || "23:59";
    parts.push(`Heures : ${start} → ${end}`);
  }

  return parts.join(" • ");
}

export default function ArticleEdit() {
  const navigate = useNavigate();
  const { articleId } = useParams();

  const isCreate = articleId === "new" || !articleId;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarText, setSnackbarText] = useState("");

  const [form, setForm] = useState({
    title: "",
    excerpt: "",
    content: "",
    status: "draft",
    cover_url: "",
    source_url: "",
    display_date_start: "",
    display_date_end: "",
    display_time_start: "",
    display_time_end: "",
  });

  const [useDateRange, setUseDateRange] = useState(false);
  const [useTimeRange, setUseTimeRange] = useState(false);

  const displaySummary = useMemo(() => buildWindowSummary(form), [form]);

  function showError(message) {
    setSnackbarText(message || "Une erreur est survenue.");
    setSnackbarOpen(true);
  }

  function patchForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (isCreate) return;

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setPageError("");

        const res = await fetch(`/box-management/client-admin/articles/${articleId}/`, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!res.ok) {
          let errText = "Impossible de charger l’article.";
          try {
            const errData = await res.json();
            errText =
              errData?.detail ||
              errData?.error ||
              errText;
          } catch {}
          throw new Error(errText);
        }

        const data = await res.json();
        if (cancelled) return;

        const nextForm = {
          title: data?.title || "",
          excerpt: data?.excerpt || "",
          content: data?.content || "",
          status: data?.status || "draft",
          cover_url: data?.cover_url || "",
          source_url: data?.source_url || "",
          display_date_start: toInputDate(data?.display_date_start),
          display_date_end: toInputDate(data?.display_date_end),
          display_time_start: toInputTime(data?.display_time_start),
          display_time_end: toInputTime(data?.display_time_end),
        };

        setForm(nextForm);
        setUseDateRange(
          !!nextForm.display_date_start || !!nextForm.display_date_end
        );
        setUseTimeRange(
          !!nextForm.display_time_start || !!nextForm.display_time_end
        );
      } catch (err) {
        if (!cancelled) {
          setPageError(err?.message || "Impossible de charger l’article.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [articleId, isCreate]);

  async function handleSave(nextStatus = null) {
    setSaving(true);
    setPageError("");

    try {
      const payload = {
        ...form,
        status: nextStatus || form.status,
        display_date_start: useDateRange ? form.display_date_start || null : null,
        display_date_end: useDateRange ? form.display_date_end || null : null,
        display_time_start: useTimeRange ? form.display_time_start || null : null,
        display_time_end: useTimeRange ? form.display_time_end || null : null,
      };

      const method = isCreate ? "POST" : "PATCH";
      const url = isCreate
        ? "/box-management/client-admin/articles/"
        : `/box-management/client-admin/articles/${articleId}/`;

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data && typeof data === "object") {
          const firstError =
            data.detail ||
            data.error ||
            Object.values(data)?.flat?.()?.[0] ||
            Object.values(data)?.[0];
          throw new Error(
            typeof firstError === "string"
              ? firstError
              : "Impossible d’enregistrer l’article."
          );
        }
        throw new Error("Impossible d’enregistrer l’article.");
      }

      const savedId = data?.id || articleId;

      if ((nextStatus || form.status) === "published") {
        navigate("/client/articles", {
          state: {
            publishSuccess: true,
            articleId: savedId,
          },
        });
        return;
      }

      if (isCreate && savedId) {
        navigate(`/client/articles/${savedId}`, {
          replace: true,
        });
      } else {
        setSnackbarText("Article enregistré.");
        setSnackbarOpen(true);
      }
    } catch (err) {
      showError(err?.message || "Impossible d’enregistrer l’article.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (pageError && !saving) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{pageError}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 980, mx: "auto" }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Button
          variant="text"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/client/articles")}
        >
          Retour à mes articles
        </Button>
      </Stack>

      <Paper sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {isCreate ? "Nouvel article" : "Modifier l’article"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Rédige ton contenu et définis, si besoin, une fenêtre d’affichage.
            </Typography>
          </Box>

          <Divider />

          <Stack spacing={2}>
            <TextField
              label="Titre"
              value={form.title}
              onChange={(e) => patchForm("title", e.target.value)}
              fullWidth
              required
            />

            <TextField
              label="Extrait"
              value={form.excerpt}
              onChange={(e) => patchForm("excerpt", e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />

            <TextField
              label="Contenu"
              value={form.content}
              onChange={(e) => patchForm("content", e.target.value)}
              fullWidth
              multiline
              minRows={10}
              required
            />

            <TextField
              label="Image de couverture"
              value={form.cover_url}
              onChange={(e) => patchForm("cover_url", e.target.value)}
              fullWidth
            />

            <TextField
              label="Lien source"
              value={form.source_url}
              onChange={(e) => patchForm("source_url", e.target.value)}
              fullWidth
            />

            <TextField
              select
              label="Statut"
              value={form.status}
              onChange={(e) => patchForm("status", e.target.value)}
              fullWidth
            >
              <MenuItem value="draft">Brouillon</MenuItem>
              <MenuItem value="published">Publié</MenuItem>
              <MenuItem value="archived">Archivé</MenuItem>
            </TextField>
          </Stack>

          <Divider />

          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Fenêtre d’affichage
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Les restrictions de date et d’heure sont indépendantes et optionnelles.
              </Typography>
            </Box>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Switch
                    checked={useDateRange}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseDateRange(checked);
                      if (!checked) {
                        setForm((prev) => ({
                          ...prev,
                          display_date_start: "",
                          display_date_end: "",
                        }));
                      }
                    }}
                  />
                  <Typography variant="body2" sx={{ userSelect: "none" }}>
                    Limiter par dates
                  </Typography>
                </Box>

                {useDateRange ? (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                  >
                    <TextField
                      label="Date de début"
                      type="date"
                      value={form.display_date_start}
                      onChange={(e) =>
                        patchForm("display_date_start", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <TextField
                      label="Date de fin"
                      type="date"
                      value={form.display_date_end}
                      onChange={(e) =>
                        patchForm("display_date_end", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Stack>
                ) : null}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Switch
                    checked={useTimeRange}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseTimeRange(checked);
                      if (!checked) {
                        setForm((prev) => ({
                          ...prev,
                          display_time_start: "",
                          display_time_end: "",
                        }));
                      }
                    }}
                  />
                  <Typography variant="body2" sx={{ userSelect: "none" }}>
                    Limiter par heures
                  </Typography>
                </Box>

                {useTimeRange ? (
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                  >
                    <TextField
                      label="Heure de début"
                      type="time"
                      value={form.display_time_start}
                      onChange={(e) =>
                        patchForm("display_time_start", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ step: 60 }}
                      fullWidth
                    />
                    <TextField
                      label="Heure de fin"
                      type="time"
                      value={form.display_time_end}
                      onChange={(e) =>
                        patchForm("display_time_end", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ step: 60 }}
                      fullWidth
                    />
                  </Stack>
                ) : null}
              </Stack>
            </Paper>

            <Alert severity="info">
              {displaySummary}
            </Alert>
          </Stack>

          <Divider />

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="flex-end"
          >
            <Button
              variant="outlined"
              onClick={() => navigate("/client/articles")}
              disabled={saving}
            >
              Annuler
            </Button>

            <Button
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={() => handleSave("draft")}
              disabled={saving}
            >
              Enregistrer en brouillon
            </Button>

            <Button
              variant="contained"
              startIcon={<PublicIcon />}
              onClick={() => handleSave("published")}
              disabled={saving}
            >
              Publier
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={5000}
        onClose={() => setSnackbarOpen(false)}
        message={snackbarText}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      />
    </Box>
  );
}
