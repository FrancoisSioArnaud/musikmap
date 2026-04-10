import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
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
import Chip from "@mui/material/Chip";
import Checkbox from "@mui/material/Checkbox";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import { getCookie } from "../Security/TokensUtils";

const STATUS_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "created", label: "Créés" },
  { value: "generated", label: "Générés" },
  { value: "downloaded", label: "Téléchargés" },
  { value: "assigned", label: "Assignés" },
  { value: "unassigned", label: "Non assignés" },
  { value: "never_generated", label: "Jamais générés" },
  { value: "never_downloaded", label: "Jamais téléchargés" },
  { value: "inactive", label: "Désactivés" },
];

function normalizePayload(payload) {
  if (Array.isArray(payload)) return { results: payload, counts: {} };
  return {
    results: Array.isArray(payload?.results) ? payload.results : [],
    counts: payload?.counts || {},
  };
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR");
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    return data?.detail || "Action impossible.";
  }
  return (await response.text().catch(() => "")) || "Action impossible.";
}

export default function StickersList() {
  const [stickers, setStickers] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionLoading, setActionLoading] = useState("");

  const fetchStickers = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);

      const response = await fetch(
        `/box-management/client-admin/stickers/${params.toString() ? `?${params.toString()}` : ""}`,
        { credentials: "same-origin" }
      );

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = normalizePayload(await response.json().catch(() => ({})));
      setStickers(data.results);
      setCounts(data.counts || {});
      setSelectedIds([]);
    } catch (error) {
      setStickers([]);
      setCounts({});
      setPageError(error.message || "Impossible de charger les stickers.");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  useEffect(() => {
    fetchStickers();
  }, [fetchStickers]);

  const selectedCount = selectedIds.length;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleToggleSticker = (stickerId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(stickerId)) next.delete(stickerId);
      else next.add(stickerId);
      return Array.from(next);
    });
  };

  const handleSelectFromList = (list) => {
    setSelectedIds(Array.from(new Set((list || []).map((item) => item.id))));
  };

  const selectedStickers = useMemo(
    () => stickers.filter((sticker) => selectedSet.has(sticker.id)),
    [stickers, selectedSet]
  );

  const postJson = async (url, body) => {
    const csrftoken = getCookie("csrftoken");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrftoken,
      },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    return response;
  };

  const handleGenerate = async () => {
    if (!selectedCount) return;
    setActionLoading("generate");
    setPageError("");
    setPageSuccess("");

    try {
      const response = await postJson("/box-management/client-admin/stickers/generate/", {
        sticker_ids: selectedIds,
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = await response.json().catch(() => ({}));
      setPageSuccess(`${data?.count || selectedCount} stickers générés.`);
      await fetchStickers();
    } catch (error) {
      setPageError(error.message || "Génération impossible.");
    } finally {
      setActionLoading("");
    }
  };

  const handleDownload = async (format) => {
    if (!selectedCount) return;
    setActionLoading(`download-${format}`);
    setPageError("");
    setPageSuccess("");

    try {
      const response = await postJson("/box-management/client-admin/stickers/download/", {
        sticker_ids: selectedIds,
        format,
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const blob = await response.blob();
      const filename =
        format === "pdf"
          ? "stickers-a3.pdf"
          : "stickers-images.zip";
      downloadBlob(filename, blob);

      const confirmResponse = await postJson(
        "/box-management/client-admin/stickers/confirm-download/",
        {
          sticker_ids: selectedIds,
        }
      );
      if (!confirmResponse.ok) {
        throw new Error(await parseErrorResponse(confirmResponse));
      }

      setPageSuccess(
        format === "pdf"
          ? "PDF A3 généré et téléchargement confirmé."
          : "Archive d’images générée et téléchargement confirmé."
      );
      await fetchStickers();
    } catch (error) {
      setPageError(error.message || "Téléchargement impossible.");
    } finally {
      setActionLoading("");
    }
  };

  const handleUnassign = async (stickerId) => {
    setActionLoading(`unassign-${stickerId}`);
    setPageError("");
    setPageSuccess("");

    try {
      const response = await postJson(
        `/box-management/client-admin/stickers/${stickerId}/unassign/`,
        {}
      );
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      setPageSuccess("Sticker désassigné.");
      await fetchStickers();
    } catch (error) {
      setPageError(error.message || "Désassignation impossible.");
    } finally {
      setActionLoading("");
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
              Stickers
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Génère les QR codes, télécharge les exports et prépare l’installation des stickers.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={<LocalOfferRoundedIcon />}
              component={RouterLink}
              to="/client/stickers/install"
            >
              Installer des stickers
            </Button>
            <Button
              variant="contained"
              startIcon={<AutorenewRoundedIcon />}
              onClick={fetchStickers}
            >
              Actualiser
            </Button>
          </Stack>
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
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Rechercher"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Slug sticker, box, slug box…"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon />
                  </InputAdornment>
                ),
              }}
            />

            <FormControl sx={{ minWidth: { xs: "100%", md: 240 } }}>
              <InputLabel id="sticker-filter-label">Filtre</InputLabel>
              <Select
                labelId="sticker-filter-label"
                label="Filtre"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip icon={<LocalOfferRoundedIcon />} label={`${counts.all || 0} stickers`} />
            <Chip label={`${counts.never_generated || 0} jamais générés`} variant="outlined" />
            <Chip label={`${counts.never_downloaded || 0} jamais téléchargés`} variant="outlined" />
            <Chip label={`${counts.assigned || 0} assignés`} variant="outlined" />
            <Chip label={`${counts.unassigned || 0} non assignés`} variant="outlined" />
          </Stack>
        </Stack>
      </Paper>

      {pageError ? <Alert severity="error">{pageError}</Alert> : null}
      {pageSuccess ? <Alert severity="success">{pageSuccess}</Alert> : null}

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">
            Sélection
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" onClick={() => handleSelectFromList(stickers)}>
              Tout sélectionner
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleSelectFromList(stickers.filter((item) => !item.is_generated))}
            >
              Sélectionner jamais générés
            </Button>
            <Button
              variant="outlined"
              onClick={() => handleSelectFromList(stickers.filter((item) => !item.is_downloaded))}
            >
              Sélectionner jamais téléchargés
            </Button>
            <Button variant="text" onClick={() => setSelectedIds([])}>
              Tout désélectionner
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
            <Chip label={`${selectedCount} sélectionné${selectedCount > 1 ? "s" : ""}`} color="primary" variant="outlined" />
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={!selectedCount || Boolean(actionLoading)}
            >
              {actionLoading === "generate" ? "Génération…" : "Générer"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<ImageRoundedIcon />}
              onClick={() => handleDownload("images")}
              disabled={!selectedCount || Boolean(actionLoading)}
            >
              {actionLoading === "download-images" ? "Préparation…" : "Télécharger PNG (ZIP)"}
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfRoundedIcon />}
              onClick={() => handleDownload("pdf")}
              disabled={!selectedCount || Boolean(actionLoading)}
            >
              {actionLoading === "download-pdf" ? "Préparation…" : "Télécharger PDF A3"}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
          overflow: "hidden",
        }}
      >
        <Box sx={{ px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="h6">Liste des stickers</Typography>
        </Box>

        {loading ? (
          <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={stickers.length > 0 && selectedCount === stickers.length}
                      indeterminate={selectedCount > 0 && selectedCount < stickers.length}
                      onChange={(event) => {
                        if (event.target.checked) handleSelectFromList(stickers);
                        else setSelectedIds([]);
                      }}
                    />
                  </TableCell>
                  <TableCell>Sticker</TableCell>
                  <TableCell>Statut</TableCell>
                  <TableCell>Box</TableCell>
                  <TableCell>Actif</TableCell>
                  <TableCell>Généré</TableCell>
                  <TableCell>Téléchargé</TableCell>
                  <TableCell>Assigné</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stickers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography variant="body1">Aucun sticker trouvé.</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  stickers.map((sticker) => (
                    <TableRow key={sticker.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedSet.has(sticker.id)}
                          onChange={() => handleToggleSticker(sticker.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {sticker.slug}
                          </Typography>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <LinkRoundedIcon sx={{ fontSize: 16 }} />
                            <Typography variant="caption" color="text.secondary">
                              {sticker.sticker_url}
                            </Typography>
                          </Stack>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip label={sticker.status_label || sticker.status} size="small" />
                      </TableCell>
                      <TableCell>
                        {sticker.box ? (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {sticker.box.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {sticker.box.slug}
                            </Typography>
                          </Stack>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{sticker.is_active ? "Oui" : "Non"}</TableCell>
                      <TableCell>{formatDate(sticker.qr_generated_at)}</TableCell>
                      <TableCell>{formatDate(sticker.downloaded_at)}</TableCell>
                      <TableCell>{formatDate(sticker.assigned_at)}</TableCell>
                      <TableCell align="right">
                        {sticker.box ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => handleUnassign(sticker.id)}
                            disabled={Boolean(actionLoading)}
                          >
                            {actionLoading === `unassign-${sticker.id}` ? "…" : "Désassigner"}
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="text"
                            component={RouterLink}
                            to={`/client/stickers/install?sticker=${encodeURIComponent(sticker.slug)}`}
                          >
                            Installer
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  );
}
