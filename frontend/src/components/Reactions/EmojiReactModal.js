import React, { useEffect, useMemo, useState, useContext } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Divider,
  CircularProgress,
} from "@mui/material";
import AlbumIcon from "@mui/icons-material/Album";
import CloseIcon from "@mui/icons-material/Close";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";

/**
 * Props:
 * - open: boolean
 * - depositId: number
 * - onClose: () => void
 * - onApplied: (payload: { my_reaction: {emoji, reacted_at}|null, reactions_summary: Array<{emoji,count}> }) => void
 */
export default function EmojiReactModal({ open, depositId, onClose, onApplied }) {
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);

  // current selection in modal
  const initialEmojiId = catalog?.current_reaction?.id ?? null;
  const [selectedId, setSelectedId] = useState(null);

  const { userPoints, setUserPoints } = useContext(UserContext) || {};

  // load catalog when open/depositId changes
  useEffect(() => {
    if (!open || !depositId) return;
    setLoading(true);
    setError(null);
    fetch(`/box-management/emojis/catalog?deposit_id=${depositId}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        setCatalog(data);
        setSelectedId(data?.current_reaction?.id ?? null);
      })
      .catch(async (r) => {
        let msg = "Erreur réseau";
        try {
          const j = await r.json();
          msg = j?.detail || j?.error || msg;
        } catch {}
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [open, depositId]);

  const hasChanged = useMemo(() => {
    // “none” est représenté par selectedId === null
    return selectedId !== initialEmojiId;
  }, [selectedId, initialEmojiId]);

  if (!open) return null;

  const csrfToken = getCookie("csrftoken");

  const handlePurchase = async (emojiId, cost) => {
    // emojis gratuits => pas d'achat
    if (!cost || cost === 0) return true;

    try {
      const r = await fetch("/box-management/emojis/purchase", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({ emoji_id: emojiId }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = j?.message || j?.detail || "Achat impossible";
        alert(msg);
        return false;
      }
      const j = await r.json();
      // Mettre à jour le total de points dans le menu si renvoyé
      if (j.points_balance != null && setUserPoints) {
        setUserPoints(j.points_balance);
      }
      // Marquer “possédé” dans le state local
      setCatalog((prev) => {
        if (!prev) return prev;
        // Ajouter à owned_ids si absent (évite re-fetch)
        const next = new Set(prev.owned_ids || []);
        next.add(emojiId);
        return { ...prev, owned_ids: Array.from(next) };
      });
      return true;
    } catch {
      alert("Erreur pendant l'achat");
      return false;
    }
  };

  const applyReaction = async () => {
    if (!hasChanged) {
      // bouton est “Sortir” si pas de changement – rien à faire
      onClose?.();
      return;
    }
    setLoading(true);
    try {
      const r = await fetch("/box-management/reactions", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        body: JSON.stringify({
          deposit_id: depositId,
          emoji_id: selectedId ?? null, // null => suppression
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const msg = j?.message || j?.detail || "Impossible d'appliquer la réaction";
        alert(msg);
        return;
      }
      const res = await r.json();
      // upsert dans la carte du dépôt
      onApplied?.(res);
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  const clickEmoji = async (e, item) => {
    e.preventDefault();
    const { id, cost, basic } = item;
    // Si déjà possédé OU gratuit => sélection directe
    const isOwned = catalog?.owned_ids?.includes(id);
    const isFree = !cost || cost === 0;

    if (isOwned || isFree || basic) {
      setSelectedId(id);
      return;
    }
    // sinon essayer l'achat
    const ok = await handlePurchase(id, cost);
    if (ok) setSelectedId(id);
  };

  const renderEmoji = (item) => {
    const isSelected = selectedId === item.id;
    const isOwned = catalog?.owned_ids?.includes(item.id);
    const isFree = !item.cost || item.cost === 0;

    return (
      <Button
        key={item.id}
        variant={isSelected ? "contained" : "outlined"}
        onClick={(e) => clickEmoji(e, item)}
        aria-label={`Emoji ${item.char}`}
        sx={{ minWidth: 56, height: 56, fontSize: 24, m: 0.5 }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ lineHeight: 1 }}>{item.char}</span>
          {/* Cost si non possédé ET payant */}
          {!isOwned && !isFree && (
            <Box className="points_container" sx={{ display: "inline-flex", gap: 0.5, alignItems: "center", mt: 0.5 }}>
              <Typography
                variant="body1"
                component="span"
                sx={{ color: "text.primary" }}
              >
                {item.cost}
              </Typography>
              <AlbumIcon />
            </Box>
          )}
        </Box>
      </Button>
    );
  };

  return (
    <Box
      onClick={onClose}
      sx={{
        position: "fixed",
        inset: 0,
        bgcolor: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        zIndex: 1300,
      }}
    >
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 520 }}>
        <Card sx={{ borderRadius: 2 }}>
          <CardContent sx={{ pb: 2 }}>
            {/* Header */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="h6">Réagir</Typography>
              <IconButton onClick={onClose} aria-label="Fermer">
                <CloseIcon />
              </IconButton>
            </Box>

            {loading && (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress />
              </Box>
            )}

            {error && (
              <Typography color="error" sx={{ mb: 2 }}>
                {error}
              </Typography>
            )}

            {catalog && (
              <>
                {/* ligne “None” */}
                <Box sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Aucune réaction
                  </Typography>
                  <Button
                    variant={selectedId == null ? "contained" : "outlined"}
                    onClick={() => setSelectedId(null)}
                    aria-label="Aucune réaction"
                    sx={{ minWidth: 56, height: 56, fontSize: 22, m: 0.5 }}
                    title="Supprimer ma réaction"
                  >
                    ∅
                  </Button>
                </Box>

                <Divider sx={{ my: 1 }} />

                {/* basic */}
                {!!catalog.basic?.length && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      Emojis de base
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                      {catalog.basic.map(renderEmoji)}
                    </Box>
                  </Box>
                )}

                {/* payants (affichent cost si non possédés ; mêmes tuiles pour “gratuits” cost=0) */}
                {!!catalog.actives_paid?.length && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                      Emojis
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                      {catalog.actives_paid.map(renderEmoji)}
                    </Box>
                  </Box>
                )}
              </>
            )}

            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button
                variant="contained"
                onClick={applyReaction}
                disabled={loading}
              >
                {hasChanged ? "Valider" : "Sortir"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
