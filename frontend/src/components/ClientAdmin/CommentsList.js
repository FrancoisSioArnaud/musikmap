import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import ConfirmActionDialog from "../Common/ConfirmActionDialog";
import { getCookie } from "../Security/TokensUtils";

const TAB_OPTIONS = [
  { value: "quarantined", label: "Quarantaine" },
  { value: "signaled", label: "Signalés" },
  { value: "recent", label: "Récents" },
  { value: "sanctions", label: "Sanctions" },
];

function getStatusLabel(status) {
  if (status === "published") {return "Publié";}
  if (status === "quarantined") {return "En quarantaine";}
  if (status === "removed_moderation") {return "Retiré";}
  if (status === "deleted_by_author") {return "Supprimé par l’auteur";}
  return status || "—";
}

function getRestrictionLabel(value) {
  if (value === "comment_mute_24h") {return "Mute 24h";}
  if (value === "comment_mute_7d") {return "Mute 7 jours";}
  if (value === "comment_ban") {return "Ban commentaires";}
  return value || "—";
}

function formatDate(value) {
  if (!value) {return "—";}
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {return "—";}
  return date.toLocaleString("fr-FR");
}

export default function CommentsList() {
  const [tab, setTab] = useState("quarantined");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [moderatingId, setModeratingId] = useState(null);
  const [restrictionDialogOpen, setRestrictionDialogOpen] = useState(false);
  const [restrictionTarget, setRestrictionTarget] = useState(null);
  const [restrictionType, setRestrictionType] = useState("comment_mute_24h");
  const [restrictionReasonCode, setRestrictionReasonCode] = useState("manual_restriction");
  const [restrictionInternalNote, setRestrictionInternalNote] = useState("");
  const [restrictionLoading, setRestrictionLoading] = useState(false);
  const [commentToRemove, setCommentToRemove] = useState(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const url =
        tab === "sanctions"
          ? "/box-management/client-admin/comment-restrictions/?all=1"
          : `/box-management/client-admin/comments/?tab=${encodeURIComponent(tab)}`;

      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible de charger les commentaires.");
      }

      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error) {
      setPageError(error?.message || "Impossible de charger les commentaires.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const openRestrictionDialog = (item) => {
    setRestrictionTarget(item || null);
    setRestrictionType("comment_mute_24h");
    setRestrictionReasonCode("manual_restriction");
    setRestrictionInternalNote("");
    setRestrictionDialogOpen(true);
  };

  const handleModeration = async (commentId, action, reason = "") => {
    setModeratingId(commentId);
    setPageError("");

    try {
      const response = await fetch(`/box-management/client-admin/comments/${commentId}/moderate/`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ action, reason }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible de modérer ce commentaire.");
      }

      await loadItems();
    } catch (error) {
      setPageError(error?.message || "Impossible de modérer ce commentaire.");
    } finally {
      setModeratingId(null);
    }
  };

  const handleCreateRestriction = async () => {
    if (!restrictionTarget?.author?.id || restrictionLoading) {return;}

    setRestrictionLoading(true);
    setPageError("");

    try {
      const response = await fetch("/box-management/client-admin/comment-restrictions/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          user_id: restrictionTarget.author.id,
          restriction_type: restrictionType,
          reason_code: restrictionReasonCode,
          internal_note: restrictionInternalNote,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible d’ajouter cette sanction.");
      }

      setRestrictionDialogOpen(false);
      await loadItems();
    } catch (error) {
      setPageError(error?.message || "Impossible d’ajouter cette sanction.");
    } finally {
      setRestrictionLoading(false);
    }
  };

  const content = useMemo(() => {
    if (loading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      );
    }

    if (items.length === 0) {
      return (
        <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
          <Typography variant="body1">Aucun élément à afficher.</Typography>
        </Paper>
      );
    }

    if (tab === "sanctions") {
      return (
        <Stack spacing={2}>
          {items.map((item) => (
            <Paper key={item.id} elevation={0} sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={getRestrictionLabel(item.restriction_type)} color="primary" />
                  <Chip label={item.reason_code || "—"} variant="outlined" />
                </Stack>
                <Typography variant="subtitle1">{item.username || "Utilisateur supprimé"}</Typography>
                <Typography variant="body2" color="text.secondary">{item.email || "—"}</Typography>
                <Typography variant="body2">Début : {formatDate(item.starts_at)}</Typography>
                <Typography variant="body2">Fin : {formatDate(item.ends_at)}</Typography>
                {item.internal_note ? (
                  <Typography variant="body2">Note : {item.internal_note}</Typography>
                ) : null}
              </Stack>
            </Paper>
          ))}
        </Stack>
      );
    }

    return (
      <Stack spacing={2}>
        {items.map((item) => (
          <Paper key={item.id} elevation={0} sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={getStatusLabel(item.status)} color={item.status === "quarantined" ? "warning" : "default"} />
                <Chip label={`Score ${item.risk_score || 0}`} variant="outlined" />
                {item.reports_count ? <Chip label={`${item.reports_count} signalement${item.reports_count > 1 ? "s" : ""}`} variant="outlined" /> : null}
                {item.deposit_deleted ? <Chip label="Dépôt supprimé" color="warning" variant="outlined" /> : null}
              </Stack>

              <Box>
                <Typography variant="subtitle1">{item.author?.display_name || item.author?.username || "anonyme"}</Typography>
                <Typography variant="body2" color="text.secondary">{item.author?.email || "—"}</Typography>
              </Box>

              <Typography variant="body1">{item.text}</Typography>

              <Stack spacing={0.5}>
                <Typography variant="body2" color="text.secondary">
                  Dépôt : {item.deposit?.public_key || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Boîte : {item.deposit?.box_name || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Créé le {formatDate(item.created_at)}
                </Typography>
                {Array.isArray(item.risk_flags) && item.risk_flags.length > 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Flags : {item.risk_flags.join(", ")}
                  </Typography>
                ) : null}
              </Stack>

              {item.latest_decision ? (
                <Box>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    Dernière décision : {item.latest_decision.decision_code}
                  </Typography>
                  {item.latest_decision.reason_code ? (
                    <Typography variant="body2" color="text.secondary">
                      Motif : {item.latest_decision.reason_code}
                    </Typography>
                  ) : null}
                </Box>
              ) : null}

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  onClick={() => handleModeration(item.id, "publish")}
                  disabled={moderatingId === item.id}
                >
                  Publier
                </Button>
                <Button
                  onClick={() => setCommentToRemove(item)}
                  disabled={moderatingId === item.id}
                >
                  Retirer
                </Button>
                {item.author?.id ? (
                  <Button
                    onClick={() => openRestrictionDialog(item)}
                    disabled={moderatingId === item.id}
                  >
                    Sanctionner l’utilisateur
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  }, [items, loading, tab, moderatingId, loadItems]);

  return (
    <Stack spacing={3}>
      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h4">Modération des commentaires</Typography>
            <Typography variant="body2" color="text.secondary">
              File de modération, commentaires signalés et sanctions sur les commentaires du client.
            </Typography>
          </Box>

          <Tabs value={tab} onChange={(_event, nextValue) => setTab(nextValue)} variant="scrollable">
            {TAB_OPTIONS.map((option) => (
              <Tab key={option.value} value={option.value} label={option.label} />
            ))}
          </Tabs>
        </Stack>
      </Paper>

      {pageError ? <Alert severity="error">{pageError}</Alert> : null}
      {content}


      <ConfirmActionDialog
        open={Boolean(commentToRemove)}
        onClose={() => setCommentToRemove(null)}
        onConfirm={async () => {
          if (!commentToRemove?.id) {return;}
          await handleModeration(commentToRemove.id, "remove", "manual_remove");
          setCommentToRemove(null);
        }}
        title="Retirer ce commentaire ?"
        description="Le commentaire sera masqué pour les utilisateurs."
        confirmLabel={moderatingId === commentToRemove?.id ? "Retrait…" : "Retirer"}
        confirmColor="error"
        loading={moderatingId === commentToRemove?.id}
        submitOnEnter
      >
        {commentToRemove?.text ? (
          <Typography variant="body2" sx={{ mt: 2, fontWeight: 700 }}>
            {commentToRemove.text}
          </Typography>
        ) : null}
      </ConfirmActionDialog>

      <Dialog
        open={restrictionDialogOpen}
        onClose={() => setRestrictionDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          component: "form",
          onSubmit: (event) => {
            event.preventDefault();
            handleCreateRestriction();
          },
        }}
      >
        <DialogTitle>Sanctionner l’utilisateur</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">
              {restrictionTarget?.author?.display_name || restrictionTarget?.author?.username || "Utilisateur"}
            </Typography>

            <FormControl fullWidth>
              <InputLabel id="restriction-type-label">Type</InputLabel>
              <Select
                labelId="restriction-type-label"
                value={restrictionType}
                label="Type"
                onChange={(event) => setRestrictionType(event.target.value)}
              >
                <MenuItem value="comment_mute_24h">Mute 24h</MenuItem>
                <MenuItem value="comment_mute_7d">Mute 7 jours</MenuItem>
                <MenuItem value="comment_ban">Ban commentaires</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="reason_code"
              value={restrictionReasonCode}
              onChange={(event) => setRestrictionReasonCode(event.target.value)}
              fullWidth
            />

            <TextField
              label="Note interne"
              value={restrictionInternalNote}
              onChange={(event) => setRestrictionInternalNote(event.target.value)}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestrictionDialogOpen(false)}>Annuler</Button>
          <Button type="submit" disabled={restrictionLoading}>Valider</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
