import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import { getCookie } from "../Security/TokensUtils";

const EMPTY_FORM = {
  title: "",
  link: "",
  short_text: "",
  cover_image: "",
  status: "draft",
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

export default function ArticleEdit() {
  const { articleId } = useParams();
  const navigate = useNavigate();

  const isCreateMode = !articleId;

  const [formValues, setFormValues] = useState(EMPTY_FORM);
  const [initialValues, setInitialValues] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(!isCreateMode);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [meta, setMeta] = useState({
    created_at: null,
    updated_at: null,
    published_at: null,
  });

  const remainingCharacters = useMemo(() => {
    return 300 - (formValues.short_text?.length || 0);
  }, [formValues.short_text]);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(formValues) !== JSON.stringify(initialValues);
  }, [formValues, initialValues]);

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
      setInitialValues(EMPTY_FORM);
      setMeta({
        created_at: null,
        updated_at: null,
        published_at: null,
      });
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
        throw new Error(data?.detail || "Impossible de charger l’article.");
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
        status: normalized.status,
      };

      setFormValues(values);
      setInitialValues(values);
      setMeta({
        created_at: normalized.created_at,
        updated_at: normalized.updated_at,
        published_at: normalized.published_at,
      });
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

  const validateForm = () => {
    if (!formValues.title.trim()) return "Le titre est obligatoire.";
    if (!formValues.link.trim()) return "Le lien est obligatoire.";
    if (formValues.short_text.length > 300) {
      return "Le texte court ne peut pas dépasser 300 caractères.";
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setPageError(validationError);
      setPageSuccess("");
      return;
    }

    setSaving(true);
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
          status: formValues.status,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.detail || data?.message || "Enregistrement impossible."
        );
      }

      const normalized = normalizeArticle(data) || {
        ...formValues,
        id: data?.id,
        created_at: data?.created_at || null,
        updated_at: data?.updated_at || null,
        published_at: data?.published_at || null,
      };

      const nextValues = {
        title: normalized.title || formValues.title,
        link: normalized.link || formValues.link,
        short_text: normalized.short_text || formValues.short_text,
        cover_image: normalized.cover_image || formValues.cover_image,
        status: normalized.status || formValues.status,
      };

      setFormValues(nextValues);
      setInitialValues(nextValues);
      setMeta({
        created_at: normalized.created_at || meta.created_at,
        updated_at: normalized.updated_at || meta.updated_at,
        published_at: normalized.published_at || meta.published_at,
      });

      if (isCreateMode && normalized.id) {
        navigate(`/client/articles/${normalized.id}`, { replace: true });
        return;
      }

      setPageSuccess("Article enregistré.");
    } catch (error) {
      setPageError(error.message || "Enregistrement impossible.");
    } finally {
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
    <Stack spacing={3}>
      <Box>
        <Button
          component={RouterLink}
          to="/client/articles"
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
              Préview d’article externe rattachée au client connecté.
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

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2.5}>
            <TextField
              label="Titre"
              value={formValues.title}
              onChange={handleChange("title")}
              fullWidth
              required
            />

            <TextField
              label="Lien externe"
              value={formValues.link}
              onChange={handleChange("link")}
              fullWidth
              required
              placeholder="https://..."
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

            <FormControl fullWidth>
              <InputLabel id="article-status-label">Statut</InputLabel>
              <Select
                labelId="article-status-label"
                label="Statut"
                value={formValues.status}
                onChange={handleChange("status")}
              >
                <MenuItem value="draft">draft</MenuItem>
                <MenuItem value="published">published</MenuItem>
                <MenuItem value="archived">archived</MenuItem>
              </Select>
            </FormControl>

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
                <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
                  Aperçu image
                </Typography>
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
                <Button component={RouterLink} to="/client/articles">
                  Annuler
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveRoundedIcon />}
                  disabled={saving}
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
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
