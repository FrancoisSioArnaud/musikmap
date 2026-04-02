import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import TextField from "@mui/material/TextField";
import Divider from "@mui/material/Divider";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import { getCookie } from "../Security/TokensUtils";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const EMPTY_FORM = { text: "", start_date: "", end_date: "" };

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

function formatDateLabel(value) {
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

function isWithinRange(date, start, end) {
  if (!start || !end) return false;
  return date >= start && date <= end;
}

function compareItemsForChoice(a, b) {
  const createdA = new Date(a?.created_at || 0).getTime();
  const createdB = new Date(b?.created_at || 0).getTime();
  return createdB - createdA;
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

function getCountLabel(items) {
  const count = items.length;
  return `${count} phrase${count > 1 ? "s" : ""}`;
}

function truncatePhrase(text, maxLength = 26) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function getPreviewRange(rangeStartKey, rangeEndKey, hoverDateKey) {
  if (!rangeStartKey || rangeEndKey || !hoverDateKey) {
    return {
      previewStartKey: rangeStartKey || "",
      previewEndKey: rangeEndKey || "",
    };
  }

  const startDate = parseDate(rangeStartKey);
  const hoverDate = parseDate(hoverDateKey);

  if (!startDate || !hoverDate) {
    return {
      previewStartKey: rangeStartKey || "",
      previewEndKey: rangeEndKey || "",
    };
  }

  if (hoverDate < startDate) {
    return {
      previewStartKey: hoverDateKey,
      previewEndKey: rangeStartKey,
    };
  }

  return {
    previewStartKey: rangeStartKey,
    previewEndKey: hoverDateKey,
  };
}

function CalendarGrid({
  monthDate,
  onMonthChange,
  dayItemsMap,
  rangeStartKey,
  rangeEndKey,
  hoverDateKey = "",
  onDayClick,
  onDayHover,
  onDayLeave,
  showLegend = true,
  minHeight,
}) {
  const todayKey = formatDateKey(new Date());
  const { previewStartKey, previewEndKey } = useMemo(
    () => getPreviewRange(rangeStartKey, rangeEndKey, hoverDateKey),
    [hoverDateKey, rangeEndKey, rangeStartKey]
  );

  const rangeStartDate = parseDate(previewStartKey);
  const rangeEndDate = parseDate(previewEndKey);
  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
      >
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {monthDate.toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
          })}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="outlined"
            size="small"
            startIcon={<ChevronLeftRoundedIcon />}
            onClick={() => onMonthChange(addMonths(monthDate, -1))}
          >
            Mois précédent
          </Button>
          <Button
            variant="outlined"
            size="small"
            endIcon={<ChevronRightRoundedIcon />}
            onClick={() => onMonthChange(addMonths(monthDate, 1))}
          >
            Mois suivant
          </Button>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 1,
          minHeight: minHeight || "auto",
        }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <Box
            key={label}
            sx={{
              textAlign: "center",
              py: 1,
              fontSize: 13,
              fontWeight: 700,
              color: "text.secondary",
            }}
          >
            {label}
          </Box>
        ))}

        {calendarDays.map((date) => {
          const dateKey = formatDateKey(date);
          const items = dayItemsMap.get(dateKey) || [];
          const isCurrentMonth = date.getMonth() === monthDate.getMonth();
          const isToday = dateKey === todayKey;
          const isSelectedStart = previewStartKey === dateKey;
          const isSelectedEnd = previewEndKey === dateKey;
          const inSelectedRange = isWithinRange(date, rangeStartDate, rangeEndDate);
          const hasOnePhrase = items.length === 1;
          const hasMultiple = items.length > 1;

          let backgroundColor = "transparent";
          let textColor = isCurrentMonth ? "inherit" : "text.disabled";
          let borderColor = "divider";
          let borderWidth = 1;

          if (hasOnePhrase) {
            backgroundColor = "var(--mm-color-primary)";
            textColor = "#fff";
            borderColor = "var(--mm-color-primary)";
          }

          if (hasMultiple) {
            backgroundColor = "var(--mm-color-error)";
            textColor = "#fff";
            borderColor = "var(--mm-color-error)";
          }

          if (inSelectedRange && !isSelectedStart && !isSelectedEnd) {
            backgroundColor = "rgba(0, 0, 0, 0.06)";
            textColor = "inherit";
            borderColor = "rgba(0, 0, 0, 0.18)";
          }

          if (isSelectedStart || isSelectedEnd) {
            backgroundColor = "rgba(0, 0, 0, 0.15)";
            textColor = "inherit";
            borderColor = "text.primary";
          }

          if (isToday) {
            borderColor = "var(--mm-color-black)";
            borderWidth = 2;
          }

          return (
            <Button
              key={dateKey}
              variant="outlined"
              onClick={() => onDayClick(date)}
              onMouseEnter={() => onDayHover?.(date)}
              onMouseLeave={() => onDayLeave?.()}
              sx={{
                minHeight: 72,
                borderRadius: 2,
                borderColor,
                borderWidth,
                backgroundColor,
                color: textColor,
                justifyContent: "flex-start",
                alignItems: "flex-start",
                p: 1,
                textTransform: "none",
                position: "relative",
                overflow: "hidden",
                "&:hover": {
                  borderColor,
                  borderWidth,
                  backgroundColor,
                  opacity: 0.92,
                },
              }}
            >
              <Stack spacing={0.5} alignItems="flex-start" sx={{ width: "100%" }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isToday ? 800 : 600,
                    opacity: isCurrentMonth ? 1 : 0.45,
                  }}
                >
                  {date.getDate()}
                </Typography>

                {items.length ? (
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      opacity: 0.95,
                    }}
                  >
                    {items.length > 1 ? `${items.length} phrases` : truncatePhrase(items[0]?.text)}
                  </Typography>
                ) : null}

                {isToday ? (
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    Aujourd’hui
                  </Typography>
                ) : null}
              </Stack>
            </Button>
          );
        })}
      </Box>
    </Stack>
  );
}

export default function IncitationsList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [itemToDelete, setItemToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mainMonth, setMainMonth] = useState(() => startOfMonth(new Date()));
  const [rangeStartKey, setRangeStartKey] = useState("");
  const [rangeEndKey, setRangeEndKey] = useState("");
  const [hoverDateKey, setHoverDateKey] = useState("");
  const [choiceDialog, setChoiceDialog] = useState({ open: false, dateKey: "", items: [] });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("create");
  const [editorMonth, setEditorMonth] = useState(() => startOfMonth(new Date()));
  const [editorForm, setEditorForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overlapDialogOpen, setOverlapDialogOpen] = useState(false);
  const [overlapItems, setOverlapItems] = useState([]);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

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

      const activeOrFirst = nextItems.find((item) => item?.is_active_now) || nextItems[0] || null;
      if (activeOrFirst?.start_date) {
        setMainMonth(startOfMonth(parseDate(activeOrFirst.start_date) || new Date()));
      }
    } catch (error) {
      setItems([]);
      setPageError(error.message || "Impossible de charger les phrases d’incitation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const countLabel = useMemo(() => getCountLabel(items), [items]);
  const dayItemsMap = useMemo(() => buildDayItemsMap(items), [items]);
  const selectedStartDate = useMemo(() => parseDate(rangeStartKey), [rangeStartKey]);
  const hoveredDate = useMemo(() => parseDate(hoverDateKey), [hoverDateKey]);
  const previewPeriodLabel = useMemo(() => {
    const { previewStartKey, previewEndKey } = getPreviewRange(
      rangeStartKey,
      rangeEndKey,
      hoverDateKey
    );

    if (!previewStartKey) return "";
    if (!previewEndKey) {
      return `Début sélectionné : ${formatDateLabel(previewStartKey)}. Clique sur un second jour libre pour fermer la période.`;
    }

    return `Période en cours de création : du ${formatDateLabel(previewStartKey)} au ${formatDateLabel(previewEndKey)}.`;
  }, [hoverDateKey, rangeEndKey, rangeStartKey]);

  const editorDayItemsMap = useMemo(() => {
    if (editorMode !== "edit" || !editingId) return dayItemsMap;
    return buildDayItemsMap(items.filter((item) => item.id !== editingId));
  }, [dayItemsMap, editorMode, editingId, items]);

  const resetSelection = useCallback(() => {
    setRangeStartKey("");
    setRangeEndKey("");
    setHoverDateKey("");
  }, []);
  
  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditorMode("create");
    setEditingId(null);
    setEditorForm(EMPTY_FORM);
    setEditorLoading(false);
    setSaving(false);
    setCalendarExpanded(false);
    setOverlapItems([]);
    setOverlapDialogOpen(false);
    resetSelection();
  }, [resetSelection]);

  const openCreateModal = useCallback((startKey, endKey) => {
    setEditorMode("create");
    setEditingId(null);
    setEditorForm({ text: "", start_date: startKey, end_date: endKey });
    setEditorMonth(startOfMonth(parseDate(startKey) || new Date()));
    setCalendarExpanded(false);
    setEditorOpen(true);
  }, []);

  const openEditModal = useCallback(
    async (itemOrId) => {
      const nextId = typeof itemOrId === "number" ? itemOrId : itemOrId?.id;
      if (!nextId) return;

      setEditorOpen(true);
      setEditorMode("edit");
      setEditingId(nextId);
      setEditorLoading(true);
      setCalendarExpanded(false);
      setPageError("");

      try {
        const response = await fetch(`/box-management/client-admin/incitations/${nextId}/`, {
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data?.detail || "Impossible de charger la phrase d’incitation.");
        }

        setEditorForm({
          text: typeof data?.text === "string" ? data.text : "",
          start_date: data?.start_date || "",
          end_date: data?.end_date || "",
        });
        setEditorMonth(startOfMonth(parseDate(data?.start_date) || new Date()));
      } catch (error) {
        closeEditor();
        setPageError(error.message || "Impossible de charger la phrase d’incitation.");
      } finally {
        setEditorLoading(false);
      }
    },
    [closeEditor]
  );

  const handleMainDayHover = useCallback(
    (date) => {
      if (!rangeStartKey || rangeEndKey) {
        setHoverDateKey("");
        return;
      }

      const dateKey = formatDateKey(date);
      const matchedItems = dayItemsMap.get(dateKey) || [];

      if (matchedItems.length) {
        setHoverDateKey("");
        return;
      }

      setHoverDateKey(dateKey);
    },
    [dayItemsMap, rangeEndKey, rangeStartKey]
  );

  const handleMainDayLeave = useCallback(() => {
    if (!rangeStartKey || rangeEndKey) {
      setHoverDateKey("");
    }
  }, [rangeEndKey, rangeStartKey]);

  const handleMainDayClick = useCallback(
    (date) => {
      const dateKey = formatDateKey(date);
      const matchedItems = [...(dayItemsMap.get(dateKey) || [])].sort(compareItemsForChoice);

      if (matchedItems.length > 1) {
        resetSelection();
        setChoiceDialog({ open: true, dateKey, items: matchedItems });
        return;
      }

      if (matchedItems.length === 1) {
        resetSelection();
        openEditModal(matchedItems[0].id);
        return;
      }

      if (!rangeStartKey) {
        setRangeStartKey(dateKey);
        setRangeEndKey("");
        setHoverDateKey("");
        return;
      }

      if (!selectedStartDate) {
        setRangeStartKey(dateKey);
        setRangeEndKey("");
        setHoverDateKey("");
        return;
      }

      const startKey = date < selectedStartDate ? dateKey : rangeStartKey;
      const endKey = date < selectedStartDate ? rangeStartKey : dateKey;
      setRangeStartKey(startKey);
      setRangeEndKey(endKey);
      setHoverDateKey("");
      openCreateModal(startKey, endKey);
    },
    [dayItemsMap, openEditModal, openCreateModal, rangeStartKey, resetSelection, selectedStartDate]
  );

  const handleEditorCalendarClick = useCallback(
    (date) => {
      const key = formatDateKey(date);
      const startKey = editorForm.start_date;
      const endKey = editorForm.end_date;
      const startDate = parseDate(startKey);

      if (!startKey || (startKey && endKey)) {
        setEditorForm((prev) => ({ ...prev, start_date: key, end_date: "" }));
        return;
      }

      if (!startDate) {
        setEditorForm((prev) => ({ ...prev, start_date: key, end_date: "" }));
        return;
      }

      if (date < startDate) {
        setEditorForm((prev) => ({ ...prev, start_date: key, end_date: prev.start_date }));
        return;
      }

      setEditorForm((prev) => ({ ...prev, end_date: key }));
    },
    [editorForm.end_date, editorForm.start_date]
  );

  const submitEditor = useCallback(
    async (forceOverlap = false) => {
      setSaving(true);
      setPageError("");

      try {
        const url =
          editorMode === "create"
            ? "/box-management/client-admin/incitations/"
            : `/box-management/client-admin/incitations/${editingId}/`;
        const method = editorMode === "create" ? "POST" : "PATCH";
        const csrftoken = getCookie("csrftoken");

        const response = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
          },
          body: JSON.stringify({
            text: editorForm.text,
            start_date: editorForm.start_date,
            end_date: editorForm.end_date,
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

        closeEditor();
        resetSelection();
        await fetchItems();
      } catch (error) {
        setPageError(error.message || "Enregistrement impossible.");
      } finally {
        setSaving(false);
      }
    },
    [closeEditor, editorForm, editorMode, editingId, fetchItems, resetSelection]
  );

  const handleDeleteConfirm = useCallback(async () => {
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
          headers: { "X-CSRFToken": csrftoken },
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
  }, [fetchItems, itemToDelete]);

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
        <Box>
          <Typography variant="h4" gutterBottom>
            Mes phrases d’incitation
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sélectionne une plage libre dans le calendrier pour créer une phrase. Clique sur un
            jour déjà occupé pour modifier une phrase existante.
          </Typography>
        </Box>
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
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
              Calendrier des phrases
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Les jours avec une phrase sont en couleur principale. Les jours avec plusieurs phrases
              sont en rouge. Un clic sur un jour libre démarre une sélection de période.
            </Typography>
          </Box>

          <CalendarGrid
            monthDate={mainMonth}
            onMonthChange={setMainMonth}
            dayItemsMap={dayItemsMap}
            rangeStartKey={rangeStartKey}
            rangeEndKey={rangeEndKey}
            hoverDateKey={hoverDateKey}
            onDayClick={handleMainDayClick}
            onDayHover={handleMainDayHover}
            onDayLeave={handleMainDayLeave}
            showLegend
          />

          {rangeStartKey ? (
            <Alert
              severity="info"
              action={
                <Button color="inherit" size="small" onClick={resetSelection}>
                  Annuler
                </Button>
              }
            >
              {previewPeriodLabel}
            </Alert>
          ) : null}
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
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "stretch", md: "center" }}
            spacing={1.5}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Liste des phrases
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {countLabel}
              </Typography>
            </Box>
            <Chip icon={<CampaignRoundedIcon />} label={countLabel} />
          </Stack>

          {loading ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Phrase</TableCell>
                    <TableCell>Période</TableCell>
                    <TableCell>État</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} hover>
                      <TableCell sx={{ maxWidth: 480 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {item.text}
                        </Typography>
                        {item.has_overlap_warning ? (
                          <Typography
                            variant="caption"
                            color="error.main"
                            sx={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 0.5,
                              mt: 0.5,
                            }}
                          >
                            <WarningAmberRoundedIcon sx={{ fontSize: 14 }} />
                            Attention : se superpose
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{ color: item.is_past ? "error.main" : "inherit", fontWeight: 500 }}
                        >
                          {item.period_label ||
                            `Du ${formatDateLabel(item.start_date)} au ${formatDateLabel(
                              item.end_date
                            )}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {item.is_active_now ? (
                          <Chip size="small" color="success" label="En cours" />
                        ) : item.is_future ? (
                          <Chip size="small" color="info" label="À venir" />
                        ) : (
                          <Chip size="small" label="Passée" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <IconButton onClick={() => openEditModal(item.id)}>
                            <EditRoundedIcon />
                          </IconButton>
                          <IconButton onClick={() => setItemToDelete(item)}>
                            <DeleteOutlineRoundedIcon />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!items.length ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          Aucune phrase pour le moment.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>

      <Dialog
        open={choiceDialog.open}
        onClose={() => setChoiceDialog({ open: false, dateKey: "", items: [] })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Choisir la phrase à modifier</DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            Plusieurs phrases existent le {formatDateLabel(choiceDialog.dateKey)}. Choisis celle que
            tu veux modifier.
          </DialogContentText>
          <Stack spacing={1.5}>
            {choiceDialog.items.map((item) => (
              <Button
                key={item.id}
                variant="outlined"
                sx={{ justifyContent: "space-between", textTransform: "none", py: 1.25 }}
                onClick={() => {
                  setChoiceDialog({ open: false, dateKey: "", items: [] });
                  openEditModal(item.id);
                }}
              >
                <Stack alignItems="flex-start" sx={{ textAlign: "left" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {item.text}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.period_label}
                  </Typography>
                </Stack>
                <EditRoundedIcon />
              </Button>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChoiceDialog({ open: false, dateKey: "", items: [] })}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editorOpen} onClose={saving ? undefined : closeEditor} maxWidth="md" fullWidth>
        <DialogTitle>
          {editorMode === "create" ? "Nouvelle phrase d’incitation" : "Modifier la phrase d’incitation"}
        </DialogTitle>
        <DialogContent dividers>
          {editorLoading ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={2.5}>

              <TextField
                label="Phrase d’incitation"
                value={editorForm.text}
                onChange={(event) =>
                  setEditorForm((prev) => ({ ...prev, text: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (!saving && !editorLoading) {
                      submitEditor(false);
                    }
                  }
                }}
                placeholder="ex : C’est la semaine du carnaval, partage une chanson qui te donne envie de faire la fête"
                inputProps={{ maxLength: 100 }}
                helperText={`${editorForm.text.length}/100`}
                fullWidth
              />

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack spacing={2}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "stretch", sm: "center" }}
                  >
                    <Button
                      variant="outlined"
                      startIcon={<CalendarMonthRoundedIcon />}
                      onClick={() => setCalendarExpanded((prev) => !prev)}
                      sx={{ justifyContent: "flex-start", textTransform: "none" }}
                    >
                      Début : {formatDateLabel(editorForm.start_date)}
                    </Button>

                    <Button
                      variant="outlined"
                      startIcon={<CalendarMonthRoundedIcon />}
                      onClick={() => setCalendarExpanded((prev) => !prev)}
                      sx={{ justifyContent: "flex-start", textTransform: "none" }}
                    >
                      Fin : {formatDateLabel(editorForm.end_date)}
                    </Button>
                  </Stack>

                  {calendarExpanded ? (
                    <>
                      <Divider />
                      <Typography variant="body2" color="text.secondary">
                        Calendrier de sélection. Premier clic = début, deuxième clic = fin. Il montre
                        aussi les autres phrases déjà existantes.
                      </Typography>
                      <CalendarGrid
                        monthDate={editorMonth}
                        onMonthChange={setEditorMonth}
                        dayItemsMap={editorDayItemsMap}
                        rangeStartKey={editorForm.start_date}
                        rangeEndKey={editorForm.end_date}
                        onDayClick={handleEditorCalendarClick}
                        showLegend={false}
                        minHeight={420}
                      />
                    </>
                  ) : null}
                </Stack>
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {editorMode === "edit" ? (
            <Button
              color="error"
              onClick={() => {
                if (editingId && !saving) {
                  setItemToDelete({ id: editingId, text: editorForm.text });
                  closeEditor();
                }
              }}
              disabled={saving || editorLoading}
            >
              Supprimer
            </Button>
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Button onClick={closeEditor} disabled={saving || editorLoading}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={() => submitEditor(false)}
            disabled={saving || editorLoading}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={overlapDialogOpen}
        onClose={() => setOverlapDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>La période se superpose</DialogTitle>
        <DialogContent dividers>
          <DialogContentText sx={{ mb: 2 }}>
            Une ou plusieurs phrases existent déjà sur cette période. Tu peux quand même enregistrer
            si tu confirmes.
          </DialogContentText>
          <Stack spacing={1.5}>
            {overlapItems.map((item) => (
              <Paper key={item.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {item.text}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {item.period_label}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOverlapDialogOpen(false)}>Retour</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setOverlapDialogOpen(false);
              submitEditor(true);
            }}
          >
            Enregistrer quand même
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!itemToDelete}
        onClose={deleteLoading ? undefined : () => setItemToDelete(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Supprimer cette phrase ?</DialogTitle>
        <DialogContent dividers>
          <DialogContentText>
            Cette action supprimera définitivement la phrase d’incitation.
          </DialogContentText>
          {itemToDelete?.text ? (
            <Typography variant="body2" sx={{ mt: 2, fontWeight: 700 }}>
              {itemToDelete.text}
            </Typography>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setItemToDelete(null)} disabled={deleteLoading}>
            Annuler
          </Button>
          <Button color="error" onClick={handleDeleteConfirm} disabled={deleteLoading}>
            {deleteLoading ? "Suppression…" : "Supprimer"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
