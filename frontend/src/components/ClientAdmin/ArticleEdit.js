import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Chip from "@mui/material/Chip";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import PublishRoundedIcon from "@mui/icons-material/PublishRounded";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import DownloadForOfflineRoundedIcon from "@mui/icons-material/DownloadForOfflineRounded";
import { getCookie } from "../Security/TokensUtils";

const EMPTY_FORM = {
  title: "",
  link: "",
  short_text: "",
  cover_image: "",
};

function normalizeArticle(data) {
  if (!data || typeof data !== "object") return null;
  return {
    id: data.id,
    title: data.title || "",
    link: data.link || "",
    short_text: data.short_text || "",
    cover_image: data.cover_image || "",
    status: data.status || "draft",
    created_at: data.created_at || null,
    updated_at: data.updated_at || null,
    published_at: data.published_at || null,
  };
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR");
}

function extractErrorMessage(data, fallbackMessage) {
  if (!data) return fallbackMessage;

  if (typeof data.detail === "string" && data.detail.trim()) {
    return data.detail.trim();
  }

  if (typeof data.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  const firstFieldKey = Object.keys(data)[0];
  if (!firstFieldKey) return fallbackMessage;

  const firstFieldValue = data[firstFieldKey];
  if (Array.isArray(firstFieldValue) && firstFieldValue.length > 0) {
    return String(firstFieldValue[0]);
  }
  if (typeof firstFieldValue === "string" && firstFieldValue.trim()) {
    return firstFieldValue.trim();
  }

  return fallbackMessage;
}

export default function ArticleEdit() {
  const { articleId } = useParams();
  const navigate = useNavigate();

  const isCreateMode = !articleId;

  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [initialValues, setInitialValues] = useState({
    ...EMPTY_FORM,
    status: "draft",
  });
  const [loading, setLoading] = useState(!isCreateMode);
  const [savingStatus, setSavingStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [imageChoices, setImageChoices] = useState([]);
  const [meta, setMeta] = useState({
    status: "draft",
    created_at: null,
    updated_at: null,
    published_at: null,
  });

  const remainingCharacters = useMemo(() => {
    return 300 - (formValues.short_text?.length || 0);
  }, [formValues.short_text]);

  const hasUnsavedChanges = useMemo(() => {
    const current = JSON.stringify({ ...formValues, status: meta.status });
    const initial = JSON.stringify(initialValues);
    return current !== initial;
  }, [formValues, initialValues, meta.status]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (isCreateMode) {
      setLoading(false);
      setFormValues(EMPTY_FORM);
      setInitialValues({
        ...EMPTY_FORM,
        status: "draft",
      });
      setMeta({
        status: "draft",
        created_at: null,
        updated_at: null,
        published_at: null,
      });
      setImageChoices([]);
    }
  }, [isCreateMode]);

  const fetchArticle = useCallback(async () => {
    if (isCreateMode || !articleId) return;

    setLoading(true);
    setPageError("");

    try {
      const response = await fetch(
        `/box-management/client-admin/articles/${articleId}/`,
        {
          credentials: "same-origin",
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Impossible de charger l’article."));
      }

      const normalized = normalizeArticle(data);
      if (!normalized) {
        throw new Error("Article introuvable.");
      }

      const values = {
        title: normalized.title,
        link: normalized.link,
        short_text: normalized.short_text,
        cover_image: normalized.cover_image,
      };

      setFormValues(values);
      setInitialValues({
        ...values,
        status: normalized.status,
      });
      setMeta({
        status: normalized.status,
        created_at: normalized.created_at,
        updated_at: normalized.updated_at,
        published_at: normalized.published_at,
      });
      setImageChoices(normalized.cover_image ? [normalized.cover_image] : []);
    } catch (error) {
      setPageError(error.message || "Impossible de charger l’article.");
    } finally {
      setLoading(false);
    }
  }, [articleId, isCreateMode]);

  useEffect(() => {
    fetchArticle();
  }, [fetchArticle]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setFormValues((prev) => ({
      ...prev,
      [field]: field === "short_text" ? value.slice(0, 300) : value,
    }));
  };

  const handleSelectCover = (imageUrl) => {
    setFormValues((prev) => ({
      ...prev,
      cover_image: imageUrl || "",
    }));
  };

  const confirmLeaveIfNeeded = useCallback(() => {
    if (!hasUnsavedChanges) return true;
    return window.confirm(
      "Tu as des modifications non enregistrées. Quitter cette page ?"
    );
  }, [hasUnsavedChanges]);

  const handleBackToArticles = useCallback(() => {
    if (!confirmLeaveIfNeeded()) return;
    navigate("/client/articles");
  }, [confirmLeaveIfNeeded, navigate]);

  const validateForm = (targetStatus) => {
    if (formValues.short_text.length > 300) {
      return "Le texte court ne peut pas dépasser 300 caractères.";
    }

    if (targetStatus === "published") {
      if (!formValues.title.trim()) {
        return "Le titre est obligatoire pour publier un article.";
      }
      if (!formValues.link.trim() && !formValues.short_text.trim()) {
        return "Pour publier un article, renseigne au moins un lien externe ou un texte court.";
      }
    }

    return "";
  };

  const handleImportPage = async () => {
    const trimmedLink = formValues.link.trim();
    if (!trimmedLink) {
      setPageError("Renseigne un lien externe avant d’importer la page.");
      setPageSuccess("");
      return;
    }

    const wouldOverwrite =
      Boolean(formValues.title.trim()) ||
      Boolean(formValues.short_text.trim()) ||
      Boolean(formValues.cover_image.trim());

    if (wouldOverwrite) {
      const shouldContinue = window.confirm(
        "L’import va remplacer le titre, le texte court et l’image de cover actuels. Continuer ?"
      );
      if (!shouldContinue) return;
    }

    setImporting(true);
    setPageError("");
    setPageSuccess("");

    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch(
        "/box-management/client-admin/articles/import-page/",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
          },
          credentials: "same-origin",
          body: JSON.stringify({ link: trimmedLink }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Import impossible."));
      }

      const nextImages = Array.isArray(data.cover_images)
        ? data.cover_images.filter(Boolean).slice(0, 3)
        : [];

      setImageChoices(nextImages);
      setFormValues((prev) => ({
        ...prev,
        link: data.resolved_link || trimmedLink,
        title: data.title || "",
        short_text: data.short_text || "",
        cover_image: data.cover_image || "",
      }));

      if (!data.title && !data.short_text && nextImages.length === 0) {
        setPageSuccess("Import terminé, mais la page ne contient pas de métadonnées exploitables.");
      } else if (nextImages.length > 1) {
        setPageSuccess("Import terminé. Choisis l’image à conserver parmi les propositions.");
      } else {
        setPageSuccess("Import terminé.");
      }
    } catch (error) {
      setPageError(error.message || "Import impossible.");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async (targetStatus) => {
    const validationError = validateForm(targetStatus);
    if (validationError) {
      setPageError(validationError);
      setPageSuccess("");
      return;
    }

    setSavingStatus(targetStatus);
    setPageError("");
    setPageSuccess("");

    try {
      const csrftoken = getCookie("csrftoken");

      const requestUrl = isCreateMode
        ? "/box-management/client-admin/articles/"
        : `/box-management/client-admin/articles/${articleId}/`;

      const requestMethod = isCreateMode ? "POST" : "PATCH";

      const response = await fetch(requestUrl, {
        method: requestMethod,
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        credentials: "same-origin",
        body: JSON.stringify({
          title: formValues.title.trim(),
          link: formValues.link.trim(),
          short_text: formValues.short_text.trim(),
          cover_image: formValues.cover_image.trim(),
          status: targetStatus,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(extractErrorMessage(data, "Enregistrement impossible."));
      }

      const normalized = normalizeArticle(data) || {
        ...formValues,
        status: targetStatus,
        id: data?.id,
        created_at: data?.created_at || null,
        updated_at: data?.updated_at || null,
        published_at: data?.published_at || null,
      };

      const nextValues = {
        title: normalized.title || "",
        link: normalized.link || "",
        short_text: normalized.short_text || "",
        cover_image: normalized.cover_image || "",
      };

      const nextStatus = normalized.status || targetStatus;

      setFormValues(nextValues);
      setInitialValues({
        ...nextValues,
        status: nextStatus,
      });
      setMeta({
        status: nextStatus,
        created_at: normalized.created_at || meta.created_at,
        updated_at: normalized.updated_at || meta.updated_at,
        published_at: normalized.published_at || meta.published_at,
      });
      setImageChoices(
        normalized.cover_image
          ? [normalized.cover_image, ...imageChoices].filter(Boolean).slice(0, 3)
          : imageChoices
      );

      if (isCreateMode && normalized.id) {
        navigate(`/client/articles/${normalized.id}`, { replace: true });
        return;
      }

      if (nextStatus === "published") {
        setPageSuccess("Article publié.");
      } else if (nextStatus === "archived") {
        setPageSuccess("Article archivé.");
      } else {
        setPageSuccess("Brouillon enregistré.");
      }
    } catch (error) {
      setPageError(error.message || "Enregistrement impossible.");
    } finally {
      setSavingStatus("");
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
    <Stack spacing={3}>
      <Box>
        <Button
          onClick={handleBackToArticles}
          startIcon={<ArrowBackRoundedIcon />}
        >
          Retour à mes articles
        </Button>
      </Box>

      {pageError ? <Alert severity="error">{pageError}</Alert> : null}
      {pageSuccess ? <Alert severity="success">{pageSuccess}</Alert> : null}

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Box>
            <Typography variant="h4" gutterBottom>
              {isCreateMode ? "Nouvel article" : "Modifier l’article"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Article rédigé à la main ou importé depuis une page externe.
            </Typography>
          </Box>

          {!isCreateMode && formValues.link ? (
            <Button
              component="a"
              href={formValues.link}
              target="_blank"
              rel="noreferrer"
              variant="outlined"
              startIcon={<LaunchRoundedIcon />}
            >
              Ouvrir le lien
            </Button>
          ) : null}
        </Stack>

        <Box component="form" onSubmit={(event) => event.preventDefault()}>
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", md: "flex-start" }}
            >
              <TextField
                label="Lien externe"
                value={formValues.link}
                onChange={handleChange("link")}
                fullWidth
                placeholder="https://..."
              />

              <Button
                variant="outlined"
                onClick={handleImportPage}
                disabled={importing}
                startIcon={
                  importing ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <DownloadForOfflineRoundedIcon />
                  )
                }
                sx={{ minWidth: { xs: "100%", md: 180 }, whiteSpace: "nowrap" }}
              >
                Importer la page
              </Button>
            </Stack>

            <TextField
              label="Titre"
              value={formValues.title}
              onChange={handleChange("title")}
              fullWidth
            />

            <TextField
              label="Texte court"
              value={formValues.short_text}
              onChange={handleChange("short_text")}
              fullWidth
              multiline
              minRows={3}
              helperText={`${formValues.short_text.length}/300 caractères`}
              error={remainingCharacters < 0}
            />

            <TextField
              label="URL cover image"
              value={formValues.cover_image}
              onChange={handleChange("cover_image")}
              fullWidth
              placeholder="https://..."
            />

            {imageChoices.length > 1 ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">
                    Choisir l’image de cover
                  </Typography>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={1.5}
                    useFlexGap
                    flexWrap="wrap"
                  >
                    {imageChoices.map((imageUrl) => {
                      const isSelected = imageUrl === formValues.cover_image;
                      return (
                        <Paper
                          key={imageUrl}
                          elevation={0}
                          sx={{
                            p: 1,
                            width: { xs: "100%", md: 220 },
                            borderRadius: 2,
                            border: "1px solid",
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
                                borderRadius: 1.5,
                                bgcolor: "grey.100",
                              }}
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                            <Button
                              size="small"
                              variant={isSelected ? "contained" : "outlined"}
                              onClick={() => handleSelectCover(imageUrl)}
                            >
                              {isSelected ? "Image sélectionnée" : "Utiliser cette image"}
                            </Button>
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                </Stack>
              </Paper>
            ) : null}

            {formValues.cover_image ? (
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1">Aperçu image</Typography>
                    {formValues.cover_image && imageChoices.length > 1 ? (
                      <Chip size="small" label="modifiable" />
                    ) : null}
                  </Stack>
                  <Box
                    component="img"
                    src={formValues.cover_image}
                    alt={formValues.title || "cover preview"}
                    sx={{
                      width: "100%",
                      maxWidth: 520,
                      height: "auto",
                      borderRadius: 2,
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

            <Divider />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary">
                  Statut : {meta.status || "draft"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Créé le : {formatDate(meta.created_at)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Modifié le : {formatDate(meta.updated_at)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Publié le : {formatDate(meta.published_at)}
                </Typography>
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button onClick={handleBackToArticles}>
                  Annuler
                </Button>

                {!isCreateMode ? (
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<ArchiveRoundedIcon />}
                    onClick={() => handleSave("archived")}
                    disabled={Boolean(savingStatus)}
                  >
                    {savingStatus === "archived" ? "Archivage..." : "Archiver"}
                  </Button>
                ) : null}

                <Button
                  variant="outlined"
                  startIcon={<SaveRoundedIcon />}
                  onClick={() => handleSave("draft")}
                  disabled={Boolean(savingStatus)}
                >
                  {savingStatus === "draft"
                    ? "Enregistrement..."
                    : "Enregistrer comme brouillon"}
                </Button>

                <Button
                  variant="contained"
                  startIcon={<PublishRoundedIcon />}
                  onClick={() => handleSave("published")}
                  disabled={Boolean(savingStatus)}
                >
                  {savingStatus === "published" ? "Publication..." : "Publier"}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Box>
      </Paper>

      {!isCreateMode && formValues.link ? (
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
            Lien cible
          </Typography>
          <Link href={formValues.link} target="_blank" rel="noreferrer" underline="hover">
            {formValues.link}
          </Link>
        </Paper>
      ) : null}
    </Stack>
  );
}
