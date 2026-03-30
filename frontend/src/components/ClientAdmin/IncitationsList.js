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
import Divider from "@mui/material/Divider";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { getCookie } from "../Security/TokensUtils";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

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

function isWithinRange(date, start, end) {
  if (!start || !end) return false;
  return date >= start && date <= end;
}

function buildDayItemsMap(items) {
  const map = new Map();

  items.forEach((item) => {
    const start = parseDate(item?.start_date);
    const end = parseDate(item?.end_date);
    if (!start || !end) return;

    const cursor = new Date(start);
    while (cursor <= end) {
      const key = formatDateKey(cursor);
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  return map;
}

function compareItemsForChoice(a, b) {
  const createdA = new Date(a?.created_at || 0).getTime();
  const createdB = new Date(b?.created_at || 0).getTime();
  return createdB - createdA;
}

export default function IncitationsList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [dayChoice, setDayChoice] = useState({ open: false, dateKey: "", items: [] });
  const [rangeStartKey, setRangeStartKey] = useState("");

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

      const nextItems = Array.isArray(data) ? data : [];
      setItems(nextItems);

      const firstRelevantItem = nextItems.find((item) => item?.is_active_now) || nextItems[0] || null;
      if (firstRelevantItem?.start_date) {
        setCurrentMonth(startOfMonth(parseDate(firstRelevantItem.start_date) || new Date()));
      }
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
  const dayItemsMap = useMemo(() => buildDayItemsMap(items), [items]);
  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const rangeStartDate = useMemo(() => parseDate(rangeStartKey), [rangeStartKey]);

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

      setItemToDelete(null);
      await fetchItems();
    } catch (error) {
      setPageError(error.message || "Suppression impossible.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDayClick = (date) => {
    const dateKey = formatDateKey(date);
    const matchedItems = [...(dayItemsMap.get(dateKey) || [])].sort(compareItemsForChoice);

    if (matchedItems.length > 1) {
      setRangeStartKey("");
      setDayChoice({ open: true, dateKey, items: matchedItems });
      return;
    }

    if (matchedItems.length === 1) {
      setRangeStartKey("");
      navigate(`/client/incitation/${matchedItems[0].id}`);
      return;
    }

    if (!rangeStartKey) {
      setRangeStartKey(dateKey);
      return;
    }

    const start = parseDate(rangeStartKey);
    if (!start) {
      setRangeStartKey(dateKey);
      return;
    }

    const startKey = date < start ? dateKey : rangeStartKey;
    const endKey = date < start ? rangeStartKey : dateKey;
    setRangeStartKey("");
    navigate(`/client/incitation/new?start_date=${startKey}&end_date=${endKey}`);
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
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            spacing={1.5}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Calendrier des phrases
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Clique sur un jour avec phrase pour la modifier. Clique sur un jour libre pour démarrer une période, puis clique sur le jour de fin pour ouvrir la création avec ces dates préremplies.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
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
                onClick={() => setRangeStartKey("")}
                disabled={!rangeStartKey}
              >
                Effacer la sélection
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label="Phrase existante"
              sx={{
                backgroundColor: "var(--mm-color-primary)",
                color: "#fff",
                fontWeight: 700,
              }}
            />
            <Chip
              size="small"
              label="Plusieurs phrases ce jour-là"
              sx={{
                backgroundColor: "var(--mm-color-error)",
                color: "#fff",
                fontWeight: 700,
              }}
            />
            {rangeStartKey ? (
              <Chip
                size="small"
                label={`Début sélectionné : ${formatDate(rangeStartKey)}`}
                variant="outlined"
              />
            ) : null}
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
                const dateItems = dayItemsMap.get(dateKey) || [];
                const isCurrentMonth = date.getMonth() === currentMonth.getMonth();
                const hasItems = dateItems.length > 0;
                const hasMultipleItems = dateItems.length > 1;
                const isToday = dateKey === todayKey;
                const rangePreviewEnd = !hasItems && rangeStartDate ? date : null;
                const rangeStartPreview = rangeStartDate && !hasItems ? rangeStartDate : null;
                const previewStart = rangeStartPreview && rangePreviewEnd
                  ? (rangePreviewEnd < rangeStartPreview ? rangePreviewEnd : rangeStartPreview)
                  : null;
                const previewEnd = rangeStartPreview && rangePreviewEnd
                  ? (rangePreviewEnd < rangeStartPreview ? rangeStartPreview : rangePreviewEnd)
                  : null;
                const inPreviewRange = !hasItems && isWithinRange(date, previewStart, previewEnd);
                const isSelectedStart = rangeStartKey && dateKey === rangeStartKey && !hasItems;

                return (
                  <Button
                    key={dateKey}
                    variant="text"
                    onClick={() => handleDayClick(date)}
                    sx={{
                      minHeight: { xs: 64, sm: 86 },
                      borderRadius: 2,
                      border: isToday ? "2px solid" : "1px solid",
                      borderColor: isToday ? "primary.main" : isSelectedStart ? "primary.main" : "divider",
                      alignItems: "flex-start",
                      justifyContent: "flex-start",
                      p: 1,
                      textTransform: "none",
                      opacity: isCurrentMonth ? 1 : 0.45,
                      backgroundColor: hasMultipleItems
                        ? "var(--mm-color-error)"
                        : hasItems
                          ? "var(--mm-color-primary)"
                          : inPreviewRange
                            ? "action.selected"
                            : "transparent",
                      color: hasItems ? "#fff" : "text.primary",
                      '&:hover': {
                        backgroundColor: hasMultipleItems
                          ? "var(--mm-color-error)"
                          : hasItems
                            ? "var(--mm-color-primary)"
                            : inPreviewRange
                              ? "action.selected"
                              : "action.hover",
                      },
                    }}
                  >
                    <Stack spacing={0.5} alignItems="flex-start" sx={{ width: "100%" }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: hasItems ? "#fff" : "text.primary" }}
                      >
                        {date.getDate()}
                      </Typography>
                      {hasItems ? (
                        <Typography
                          variant="caption"
                          sx={{
                            color: "rgba(255,255,255,0.92)",
                            textAlign: "left",
                            lineHeight: 1.2,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {dateItems.length > 1 ? `${dateItems.length} phrases` : dateItems[0]?.text}
                        </Typography>
                      ) : isSelectedStart ? (
                        <Typography variant="caption" sx={{ textAlign: "left", lineHeight: 1.2 }}>
                          Début
                        </Typography>
                      ) : null}
                    </Stack>
                  </Button>
                );
              })}
            </Box>
          </Paper>
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
                          {item?.created_at ? new Date(item.created_at).toLocaleDateString("fr-FR") : "—"}
                        </Typography>
                      </TableCell>

                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" spacing={1}>
                          <IconButton
                            aria-label="Modifier"
                            color="primary"
                            onClick={() => navigate(`/client/incitation/${item.id}`)}
                          >
                            <EditRoundedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            aria-label="Supprimer"
                            color="error"
                            onClick={() => setItemToDelete(item)}
                          >
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
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
        open={dayChoice.open}
        onClose={() => setDayChoice({ open: false, dateKey: "", items: [] })}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Plusieurs phrases ce jour-là</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Le {formatDate(dayChoice.dateKey)} contient plusieurs phrases d’incitation. Choisis celle que tu veux modifier.
          </DialogContentText>

          <Stack spacing={1.25}>
            {dayChoice.items.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Stack spacing={1}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {item.text}
                    </Typography>
                    {Number(item?.overlap_count || 0) > 0 ? (
                      <Chip
                        size="small"
                        icon={<WarningAmberRoundedIcon />}
                        label={`Chevauchement (${item.overlap_count})`}
                        color="warning"
                      />
                    ) : null}
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {item.period_label || `${formatDate(item.start_date)} → ${formatDate(item.end_date)}`}
                  </Typography>

                  <Button
                    variant="outlined"
                    onClick={() => {
                      setDayChoice({ open: false, dateKey: "", items: [] });
                      navigate(`/client/incitation/${item.id}`);
                    }}
                  >
                    Modifier cette phrase
                  </Button>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDayChoice({ open: false, dateKey: "", items: [] })}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!itemToDelete}
        onClose={() => (deleteLoading ? null : setItemToDelete(null))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Supprimer la phrase</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Cette phrase sera supprimée définitivement. Cette action est irréversible.
          </DialogContentText>
          {itemToDelete ? (
            <Paper variant="outlined" sx={{ p: 1.5, mt: 2, borderRadius: 2 }}>
              <Typography variant="body1" sx={{ fontWeight: 700, mb: 0.75 }}>
                {itemToDelete.text}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {itemToDelete.period_label || `${formatDate(itemToDelete.start_date)} → ${formatDate(itemToDelete.end_date)}`}
              </Typography>
            </Paper>
          ) : null}
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
