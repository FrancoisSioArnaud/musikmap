import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableHead from "@mui/material/TableHead";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import { getCookie } from "../Security/TokensUtils";
import ConfirmActionDialog from "../Common/ConfirmActionDialog";

const STATUS_OPTIONS = ["all", "draft", "published", "archived"];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR");
}

function getStatusChipColor(status) {
  if (status === "published") return "success";
  if (status === "archived") return "default";
  return "warning";
}

function getStatusLabel(status) {
  if (status === "published") return "Publié";
  if (status === "archived") return "Archivé";
  return "Brouillon";
}

function getVisibilityStateColor(state) {
  if (state === "visible_now") return "success";
  if (state === "scheduled") return "info";
  if (state === "out_of_hours") return "warning";
  if (state === "expired") return "default";
  return "default";
}

function getVisibilityStateLabel(article) {
  return article?.visibility_state_label || "—";
}

function getDisplayWindowLabel(article) {
  const dateLabel = article?.display_date_range_label || "Toujours";
  const timeLabel = article?.display_time_range_label || "Toute la journée";
  return `${dateLabel} · ${timeLabel}`;
}

function normalizeArticles(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.articles)) return payload.articles;
  return [];
}

export default function ArticlesList() {
  const navigate = useNavigate();

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [articleToArchive, setArticleToArchive] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);

      const url = `/box-management/client-admin/articles/${
        params.toString() ? `?${params.toString()}` : ""
      }`;

      const response = await fetch(url, {
        credentials: "same-origin",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || "Impossible de charger les articles.");
      }

      setArticles(normalizeArticles(data));
    } catch (error) {
      setPageError(error.message || "Impossible de charger les articles.");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const filteredCountLabel = useMemo(() => {
    const count = articles.length;
    return `${count} article${count > 1 ? "s" : ""}`;
  }, [articles]);

  const handleArchiveConfirm = async () => {
    if (!articleToArchive) return;

    setArchiveLoading(true);
    setPageError("");

    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch(
        `/box-management/client-admin/articles/${articleToArchive.id}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
          },
          credentials: "same-origin",
          body: JSON.stringify({
            status: "archived",
          }),
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.detail || "Archivage impossible.");
      }

      setArticles((prev) =>
        prev.map((item) =>
          item.id === articleToArchive.id
            ? { ...item, ...data, status: "archived" }
            : item
        )
      );
      setArticleToArchive(null);
    } catch (error) {
      setPageError(error.message || "Archivage impossible.");
    } finally {
      setArchiveLoading(false);
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
              Mes articles
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Gère les previews d’articles externes visibles pour ton client.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            component={RouterLink}
            to="/client/articles/new"
          >
            Nouvel article
          </Button>
        </Stack>
      </Paper>

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
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <TextField
            fullWidth
            label="Rechercher"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Titre, texte court, lien…"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
            }}
          />

          <FormControl sx={{ minWidth: { xs: "100%", md: 220 } }}>
            <InputLabel id="article-status-filter-label">Statut</InputLabel>
            <Select
              labelId="article-status-filter-label"
              label="Statut"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              {STATUS_OPTIONS.map((status) => (
                <MenuItem key={status} value={status}>
                  {status === "all" ? "Tous" : getStatusLabel(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="outlined" onClick={fetchArticles}>
            Actualiser
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
          }}
        >
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {filteredCountLabel}
          </Typography>
        </Box>

        {loading ? (
          <Box
            sx={{
              py: 8,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <CircularProgress />
          </Box>
        ) : articles.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <Typography variant="body1">Aucun article trouvé.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 1200 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Titre</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Diffusion</TableCell>
                  <TableCell>Fenêtre d’affichage</TableCell>
                  <TableCell>Auteur</TableCell>
                  <TableCell>Créé le</TableCell>
                  <TableCell>Modifié le</TableCell>
                  <TableCell>Publié le</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {articles.map((article) => (
                  <TableRow key={article.id} hover>
                    <TableCell sx={{ minWidth: 260 }}>
                      <Stack spacing={0.5}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {article.title || "Sans titre"}
                        </Typography>
                        {article.short_text ? (
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: "-webkit-box",
                              WebkitBoxOrient: "vertical",
                              WebkitLineClamp: 2,
                              overflow: "hidden",
                            }}
                          >
                            {article.short_text}
                          </Typography>
                        ) : null}
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={getStatusLabel(article.status)}
                        size="small"
                        color={getStatusChipColor(article.status)}
                        variant={article.status === "published" ? "filled" : "outlined"}
                      />
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={getVisibilityStateLabel(article)}
                        size="small"
                        color={getVisibilityStateColor(article.visibility_state)}
                        variant={article.visibility_state === "visible_now" ? "filled" : "outlined"}
                      />
                    </TableCell>

                    <TableCell sx={{ minWidth: 260 }}>
                      <Typography variant="body2" color="text.secondary">
                        {getDisplayWindowLabel(article)}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      {article.author_name ||
                        article.author_username ||
                        article.author?.username ||
                        "—"}
                    </TableCell>

                    <TableCell>{formatDate(article.created_at)}</TableCell>
                    <TableCell>{formatDate(article.updated_at)}</TableCell>
                    <TableCell>{formatDate(article.published_at)}</TableCell>

                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={0.5}
                        justifyContent="flex-end"
                        flexWrap="wrap"
                        useFlexGap
                      >
                        {article.link ? (
                          <Tooltip title="Ouvrir le lien externe">
                            <IconButton
                              size="small"
                              component="a"
                              href={article.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <LaunchRoundedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}

                        <Tooltip title="Modifier">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/client/articles/${article.id}`)}
                          >
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Supprimer">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => setArticleToArchive(article)}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <ConfirmActionDialog
        open={Boolean(articleToArchive)}
        onClose={() => setArticleToArchive(null)}
        onConfirm={handleArchiveConfirm}
        title="Supprimer l’article"
        description={
          articleToArchive?.title
            ? `Cette action archivera l’article “${articleToArchive.title}”. Il ne sera pas supprimé définitivement.`
            : "Cette action archivera l’article. Il ne sera pas supprimé définitivement."
        }
        confirmLabel={archiveLoading ? "Suppression..." : "Supprimer"}
        confirmColor="error"
        loading={archiveLoading}
        submitOnEnter
      />
    </Stack>
  );
}
