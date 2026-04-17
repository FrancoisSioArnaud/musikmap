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
import Snackbar from "@mui/material/Snackbar";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import Chip from "@mui/material/Chip";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import PublicIcon from "@mui/icons-material/Public";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import DownloadForOfflineRoundedIcon from "@mui/icons-material/DownloadForOfflineRounded";

import { getCookie } from "../Security/TokensUtils";

function toInputDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toInputTime(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function buildWindowSummary(form) {
  const hasDate = !!form.display_start_date || !!form.display_end_date;
  const hasTime = !!form.display_start_time || !!form.display_end_time;

  if (!hasDate && !hasTime) return "Aucune restriction d’affichage";

  const parts = [];

  if (hasDate) {
    const start = form.display_start_date || "début";
    const end = form.display_end_date || "sans fin";
    parts.push(`Dates : ${start} → ${end}`);
  }

  if (hasTime) {
    const start = form.display_start_time || "00:00";
    const end = form.display_end_time || "23:59";
    parts.push(`Heures : ${start} → ${end}`);
  }

  return parts.join(" • ");
}

function getStatusLabel(status) {
  if (status === "published") return "Publié";
  if (status === "archived") return "Archivé";
  return "Brouillon";
}

function extractErrorMessage(data, fallback) {
  if (!data || typeof data !== "object") return fallback;

  if (typeof data.detail === "string" && data.detail.trim()) {
    return data.detail.trim();
  }

  if (data.field_errors && typeof data.field_errors === "object") {
    const fieldValues = Object.values(data.field_errors);
    for (const value of fieldValues) {
      if (Array.isArray(value) && value.length > 0) {
        return String(value[0]);
      }
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  if (typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  const values = Object.values(data);
  for (const value of values) {
    if (Array.isArray(value) && value.length > 0) {
      return String(value[0]);
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

export default function ArticleEdit() {
  const navigate = useNavigate();
  const { articleId } = useParams();

  const isCreate = articleId === "new" || !articleId;

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pageError, setPageError] = useState("");

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarText, setSnackbarText] = useState("");

  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishedArticleId, setPublishedArticleId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    link: "",
    short_text: "",
    favicon: "",
    cover_image: "",
    status: "draft",
    display_start_date: "",
    display_end_date: "",
    display_start_time: "",
    display_end_time: "",
  });

  const [imageChoices, setImageChoices] = useState([]);
  const [useDateRange, setUseDateRange] = useState(false);
  const [useTimeRange, setUseTimeRange] = useState(false);

  const displaySummary = useMemo(() => buildWindowSummary(form), [form]);

  function showSnackbar(message) {
    setSnackbarText(message || "");
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

        const res = await fetch(
          `/box-management/client-admin/articles/${articleId}/`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              Accept: "application/json",
            },
          }
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            extractErrorMessage(data, "Impossible de charger l’article.")
          );
        }

        if (cancelled) return;

        const nextForm = {
          title: data?.title || "",
          link: data?.link || "",
          short_text: data?.short_text || "",
          favicon: data?.favicon || "",
          cover_image: data?.cover_image || "",
          status: data?.status || "draft",
          display_start_date: toInputDate(data?.display_start_date),
          display_end_date: toInputDate(data?.display_end_date),
          display_start_time: toInputTime(data?.display_start_time),
          display_end_time: toInputTime(data?.display_end_time),
        };

        setForm(nextForm);
        setUseDateRange(
          !!nextForm.display_start_date || !!nextForm.display_end_date
        );
        setUseTimeRange(
          !!nextForm.display_start_time || !!nextForm.display_end_time
        );
        setImageChoices(nextForm.cover_image ? [nextForm.cover_image] : []);
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

  async function handleImportFromLink() {
    const trimmedLink = (form.link || "").trim();

    if (!trimmedLink) {
      showSnackbar("Renseigne un lien externe avant d’importer la page.");
      return;
    }

    const willOverwrite =
      !!form.title.trim() ||
      !!form.short_text.trim() ||
      !!form.favicon.trim() ||
      !!form.cover_image.trim();

    if (willOverwrite) {
      const confirmed = window.confirm(
        "L’import va remplacer le titre, le texte court, le favicon et l’image de couverture actuels. Continuer ?"
      );
      if (!confirmed) return;
    }

    setImporting(true);
    setPageError("");

    try {
      const csrftoken = getCookie("csrftoken");

      const res = await fetch(
        "/box-management/client-admin/articles/import-page/",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CSRFToken": csrftoken,
          },
          body: JSON.stringify({
            link: trimmedLink,
          }),
        }
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          extractErrorMessage(
            data,
            "Impossible d’importer le contenu de cette page."
          )
        );
      }

      const nextImages = Array.isArray(data?.cover_images)
        ? data.cover_images.filter(Boolean).slice(0, 3)
        : [];

      setImageChoices(nextImages);

      setForm((prev) => ({
        ...prev,
        link: data?.resolved_link || trimmedLink,
        title: data?.title || "",
        short_text: data?.short_text || "",
        favicon: data?.favicon || "",
        cover_image: data?.cover_image || "",
      }));

      if (
        !data?.title &&
        !data?.short_text &&
        !data?.favicon &&
        nextImages.length === 0
      ) {
        showSnackbar(
          "Import terminé, mais la page ne contient pas de métadonnées exploitables."
        );
      } else if (nextImages.length > 1) {
        showSnackbar(
          "Import terminé. Choisis l’image à conserver parmi les propositions."
        );
      } else {
        showSnackbar("Contenu importé.");
      }
    } catch (err) {
      showSnackbar(
        err?.message || "Impossible d’importer le contenu de cette page."
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleSave(nextStatus) {
    setSaving(true);
    setPageError("");

    try {
      const csrftoken = getCookie("csrftoken");

      const payload = {
        title: form.title,
        link: form.link,
        short_text: form.short_text,
        favicon: form.favicon,
        cover_image: form.cover_image,
        status: nextStatus,
        display_start_date: useDateRange ? form.display_start_date || null : null,
        display_end_date: useDateRange ? form.display_end_date || null : null,
        display_start_time: useTimeRange ? form.display_start_time || null : null,
        display_end_time: useTimeRange ? form.display_end_time || null : null,
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
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(
          extractErrorMessage(data, "Impossible d’enregistrer l’article.")
        );
      }

      const savedId = data?.id || articleId || null;

      const nextForm = {
        title: data?.title || "",
        link: data?.link || "",
        short_text: data?.short_text || "",
        favicon: data?.favicon || "",
        cover_image: data?.cover_image || "",
        status: data?.status || nextStatus || "draft",
        display_start_date: toInputDate(data?.display_start_date),
        display_end_date: toInputDate(data?.display_end_date),
        display_start_time: toInputTime(data?.display_start_time),
        display_end_time: toInputTime(data?.display_end_time),
      };

      setForm(nextForm);
      setUseDateRange(
        !!nextForm.display_start_date || !!nextForm.display_end_date
      );
      setUseTimeRange(
        !!nextForm.display_start_time || !!nextForm.display_end_time
      );

      setImageChoices((prev) => {
        const merged = [
          nextForm.cover_image,
          ...(Array.isArray(prev) ? prev : []),
        ].filter(Boolean);
        return [...new Set(merged)].slice(0, 3);
      });

      if (nextStatus === "published") {
        setPublishedArticleId(savedId);
        setPublishDialogOpen(true);
        return;
      }

      if (isCreate && savedId) {
        navigate(`/client/articles/${savedId}`, { replace: true });
        return;
      }

      if (nextStatus === "archived") {
        showSnackbar("Article archivé.");
      } else {
        showSnackbar("Article enregistré.");
      }
    } catch (err) {
      showSnackbar(err?.message || "Impossible d’enregistrer l’article.");
    } finally {
      setSaving(false);
    }
  }

  function handleClosePublishDialog() {
    setPublishDialogOpen(false);
  }

  function handleModifyAfterPublish() {
    setPublishDialogOpen(false);

    if (isCreate && publishedArticleId) {
      navigate(`/client/articles/${publishedArticleId}`, { replace: true });
    }
  }

  function handleBackToArticlesAfterPublish() {
    setPublishDialogOpen(false);
    navigate("/client/articles");
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
              Crée un article manuellement ou importe les informations depuis un
              lien externe.
            </Typography>
          </Box>

          <Divider />

          <Stack spacing={2}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", md: "flex-start" }}
            >
              <TextField
                label="Lien externe"
                value={form.link}
                onChange={(e) => patchForm("link", e.target.value)}
                fullWidth
              />

              <Button
                variant="outlined"
                onClick={handleImportFromLink}
                disabled={saving || importing}
                startIcon={
                  importing ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <DownloadForOfflineRoundedIcon />
                  )
                }
                sx={{ minWidth: { xs: "100%", md: 180 }, whiteSpace: "nowrap" }}
              >
                {importing ? "Import..." : "Importer la page"}
              </Button>
            </Stack>

            <TextField
              label="Titre"
              value={form.title}
              onChange={(e) => patchForm("title", e.target.value)}
              fullWidth
            />

            <TextField
              label="Texte de l’article (Markdown)"
              value={form.short_text}
              onChange={(e) =>
                patchForm("short_text", e.target.value.slice(0, 10000))
              }
              fullWidth
              multiline
              minRows={8}
              helperText={`${form.short_text.length}/10000 caractères`}
            />

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Aide Markdown rapide
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Tu peux styliser le texte avec quelques règles simples.
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    whiteSpace: "pre-wrap",
                    fontFamily: "monospace",
                    fontSize: "0.9rem",
                  }}
                >
{`# Grand titre
## Sous-titre

**gras**
*italique*

- élément de liste
- autre élément

1. premier point
2. second point

> citation
[Texte du lien](https://exemple.com)
`}
                </Box>
              </Stack>
            </Paper>

            <TextField
              label="Favicon"
              value={form.favicon}
              onChange={(e) => patchForm("favicon", e.target.value)}
              fullWidth
            />

            {form.favicon ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Aperçu du favicon
                  </Typography>

                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "divider",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: "background.paper",
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      component="img"
                      src={form.favicon}
                      alt="favicon preview"
                      sx={{
                        width: 32,
                        height: 32,
                        objectFit: "contain",
                        display: "block",
                      }}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  </Box>
                </Stack>
              </Paper>
            ) : null}

            <TextField
              label="Image de couverture"
              value={form.cover_image}
              onChange={(e) => patchForm("cover_image", e.target.value)}
              fullWidth
            />

            {imageChoices.length > 1 ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Choisir l’image de couverture
                  </Typography>

                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1.5}
                    useFlexGap
                    flexWrap="wrap"
                  >
                    {imageChoices.map((imageUrl) => {
                      const isSelected = imageUrl === form.cover_image;

                      return (
                        <Paper
                          key={imageUrl}
                          variant="outlined"
                          sx={{
                            p: 1,
                            width: { xs: "100%", md: 220 },
                            borderColor: isSelected ? "primary.main" : "divider",
                          }}
                        >
                          <Stack spacing={1}>
                            <Box
                              component="img"
                              src={imageUrl}
                              alt="cover candidate"
                              sx={{
                                width: "100%",
                                height: 120,
                                objectFit: "cover",
                                borderRadius: 1,
                                bgcolor: "grey.100",
                              }}
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />

                            <Button
                              size="small"
                              variant={isSelected ? "contained" : "outlined"}
                              onClick={() => patchForm("cover_image", imageUrl)}
                            >
                              {isSelected
                                ? "Image sélectionnée"
                                : "Utiliser cette image"}
                            </Button>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Stack>
              </Paper>
            ) : null}

            {form.cover_image ? (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Aperçu de l’image
                    </Typography>
                    {imageChoices.length > 1 ? (
                      <Chip size="small" label="modifiable" />
                    ) : null}
                  </Stack>

                  <Box
                    component="img"
                    src={form.cover_image}
                    alt={form.title || "cover preview"}
                    sx={{
                      width: "100%",
                      maxWidth: 520,
                      height: "auto",
                      borderRadius: 1,
                      display: "block",
                      bgcolor: "grey.100",
                    }}
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                </Stack>
              </Paper>
            ) : null}

            <Alert severity="info">
              Statut actuel : {getStatusLabel(form.status)}
            </Alert>
          </Stack>

          <Divider />

          <Stack spacing={2}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Fenêtre d’affichage
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Les restrictions de date et d’heure sont indépendantes et
                optionnelles.
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
                          display_start_date: "",
                          display_end_date: "",
                        }));
                      }
                    }}
                  />
                  <Typography variant="body2" sx={{ userSelect: "none" }}>
                    Limiter par dates
                  </Typography>
                </Box>

                {useDateRange ? (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      label="Date de début"
                      type="date"
                      value={form.display_start_date}
                      onChange={(e) =>
                        patchForm("display_start_date", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <TextField
                      label="Date de fin"
                      type="date"
                      value={form.display_end_date}
                      onChange={(e) =>
                        patchForm("display_end_date", e.target.value)
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
                          display_start_time: "",
                          display_end_time: "",
                        }));
                      }
                    }}
                  />
                  <Typography variant="body2" sx={{ userSelect: "none" }}>
                    Limiter par heures
                  </Typography>
                </Box>

                {useTimeRange ? (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                      label="Heure de début"
                      type="time"
                      value={form.display_start_time}
                      onChange={(e) =>
                        patchForm("display_start_time", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ step: 60 }}
                      fullWidth
                    />
                    <TextField
                      label="Heure de fin"
                      type="time"
                      value={form.display_end_time}
                      onChange={(e) =>
                        patchForm("display_end_time", e.target.value)
                      }
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ step: 60 }}
                      fullWidth
                    />
                  </Stack>
                ) : null}
              </Stack>
            </Paper>

            <Alert severity="info">{displaySummary}</Alert>
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
              disabled={saving || importing}
            >
              Annuler
            </Button>

            {!isCreate ? (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<ArchiveRoundedIcon />}
                onClick={() => handleSave("archived")}
                disabled={saving || importing}
              >
                Archiver
              </Button>
            ) : null}

            <Button
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={() => handleSave("draft")}
              disabled={saving || importing}
            >
              Enregistrer comme brouillon
            </Button>

            <Button
              variant="contained"
              startIcon={<PublicIcon />}
              onClick={() => handleSave("published")}
              disabled={saving || importing}
            >
              Publier
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Dialog
        open={publishDialogOpen}
        onClose={handleClosePublishDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Article publié !</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Ton article a bien été publié.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleModifyAfterPublish}>Modifier</Button>
          <Button
            variant="contained"
            onClick={handleBackToArticlesAfterPublish}
          >
            Retour à mes articles
          </Button>
        </DialogActions>
      </Dialog>

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
