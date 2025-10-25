// frontend/src/components/Common/ReactionModal.js
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import { getCookie } from "../Security/TokensUtils";
import PurchaseEmojiModal from "./PurchaseEmojiModal";

/**
 * Modale de sélection de réaction
 * - Affiche: None, emojis basic, emojis actifs payants (triés par cost)
 * - Les non possédés sont grisés => clic ouvre la modale d’achat
 * - Un seul bouton pied de page : "Sortir" (si inchangé) ↔ "Valider" (si changé)
 */
export default function ReactionModal({
  open,
  onClose,
  depositId,
  currentEmoji, // optionnel, fallback si le back ne renvoie pas current_reaction
  onApplied,    // callback({ my_reaction, reactions_summary })
}) {
  const [loading, setLoading] = useState(false);

  // catalog = { basic: [{id,char,cost,active,basic}], actives_paid: [...], owned_ids: [int], current_reaction: "🔥"|null }
  const [catalog, setCatalog] = useState({
    basic: [],
    actives_paid: [],
    owned_ids: [],
    current_reaction: null,
  });

  // Valeur connue côté serveur au moment d'ouvrir la modale (char ou null)
  const [serverSelected, setServerSelected] = useState(null);
  // Sélection courante locale (char ou null)
  const [selected, setSelected] = useState(null);

  // Achat d’emoji ciblé
  const [purchaseTarget, setPurchaseTarget] = useState(null);

  // A changé si la sélection locale diffère de l'état serveur
  const hasChanged = useMemo(
    () => (selected ?? null) !== (serverSelected ?? null),
    [selected, serverSelected]
  );

  // Helper : est-ce que l'emoji est utilisable (basic ou possédé)
  const isOwned = useCallback(
    (emoji) => !!emoji && (emoji.basic || (catalog.owned_ids || []).includes(emoji.id)),
    [catalog.owned_ids]
  );

  // Récupération du catalogue + réaction actuelle depuis le back
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    async function run() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (depositId) qs.set("deposit_id", String(depositId));

        const res = await fetch(`/box-management/emojis/catalog?${qs.toString()}`, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));

        const catalogData = {
          basic: Array.isArray(data?.basic) ? data.basic : [],
          actives_paid: Array.isArray(data?.actives_paid) ? data.actives_paid : [],
          owned_ids: Array.isArray(data?.owned_ids) ? data.owned_ids : [],
          current_reaction:
            typeof data?.current_reaction === "string" || data?.current_reaction === null
              ? data.current_reaction
              : null,
        };

        if (!mounted) return;

        setCatalog(catalogData);

        // source de vérité pour l’état initial : backend
        const initialChar =
          catalogData.current_reaction ??
          (typeof currentEmoji === "string" || currentEmoji === null ? currentEmoji : null);

        setServerSelected(initialChar ?? null);
        setSelected(initialChar ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, depositId]);

  if (!open) return null;

  // Clic sur un emoji de la grille
  const onClickEmoji = (emoji) => {
    if (!emoji) {
      // None
      setSelected(null);
      return;
    }
    if (isOwned(emoji)) {
      setSelected(emoji.char);
    } else {
      setPurchaseTarget(emoji);
    }
  };

  // Après achat d’un emoji
  const onPurchaseSuccess = (emoji) => {
    // Marquer comme possédé en local
    setCatalog((prev) => ({
      ...prev,
      owned_ids: [...new Set([...(prev.owned_ids || []), emoji.id])],
    }));
    setPurchaseTarget(null);
    setSelected(emoji.char);
  };

  // Construit l'emoji_id pour POST à partir du char sélectionné
  const selectedEmojiId = useMemo(() => {
    if (selected === null) return null;
    const all = [...(catalog.basic || []), ...(catalog.actives_paid || [])];
    return all.find((e) => e.char === selected)?.id ?? null;
  }, [selected, catalog.basic, catalog.actives_paid]);

  // Soumission : uniquement si "Valider"
  const submitReaction = async () => {
    if (!hasChanged) {
      onClose?.();
      return;
    }

    const csrftoken = getCookie("csrftoken");
    const payload = {
      deposit_id: depositId,
      emoji_id: selected === null ? null : selectedEmojiId,
    };

    try {
      const res = await fetch("/box-management/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error === "forbidden") {
          alert("Tu n’as pas débloqué cet emoji.");
        } else {
          alert("Oops, impossible d’appliquer ta réaction pour le moment.");
        }
        return;
      }

      // Notifie le parent (il peut MAJ le dépôt et refermer sa propre modale si besoin)
      onApplied?.(data);

      // Synchronise l'état serveur localement pour que le bouton repasse à "Sortir" si la modale restait ouverte
      setServerSelected(selected);
      onClose?.();
    } catch {
      alert("Oops, une erreur réseau s’est produite. Réessaie plus tard.");
    }
  };

  // Élément d’emoji
  const EmojiItem = ({ emoji }) => {
    const owned = isOwned(emoji);
    const isActive = selected === emoji.char;

    return (
      <Button
        onClick={() => onClickEmoji(emoji)}
        aria-label={`Emoji ${emoji.char}${owned ? "" : " non débloqué"}`}
        title={
          owned ? `Utiliser ${emoji.char}` : `${emoji.char} — ${Number(emoji.cost || 0)} points`
        }
        disabled={false}
        sx={{
          position: "relative",
          minWidth: 52,
          minHeight: 52,
          borderRadius: 2,
          border: "1px solid",
          borderColor: isActive ? "primary.main" : "divider",
          opacity: owned ? 1 : 0.45,
          px: 1,
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>{emoji.char}</span>
        {!owned && !emoji.basic && (
          <Typography
            variant="caption"
            sx={{
              position: "absolute",
              bottom: 2,
              left: 4,
              right: 4,
              textAlign: "center",
              fontSize: 10,
              lineHeight: 1,
              opacity: 0.9,
              pointerEvents: "none",
            }}
          >
            {Number(emoji.cost || 0)} pts
          </Typography>
        )}
      </Button>
    );
  };

  const ButtonOne = (
    <Button
      fullWidth
      variant={hasChanged ? "contained" : "outlined"}
      onClick={() => {
        if (!hasChanged) return onClose?.(); // Sortir
        return submitReaction(); // Valider
      }}
      aria-label={hasChanged ? "Valider ma réaction" : "Sortir"}
    >
      {hasChanged ? "Valider" : "Sortir"}
    </Button>
  );

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
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 560 }}>
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography component="h1" variant="h5" sx={{ mb: 1 }}>
              Réagir
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Choisis un emoji pour dire à l’artiste ce que tu as pensé de sa chanson.
            </Typography>

            {loading ? (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {/* None */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Button
                    onClick={() => onClickEmoji(null)}
                    aria-label="Aucune réaction"
                    title="Aucune réaction"
                    sx={{
                      border: "1px dashed",
                      borderColor: selected === null ? "primary.main" : "divider",
                      borderRadius: 2,
                      px: 1.5,
                      py: 0.75,
                    }}
                  >
                    <Typography variant="body2">None</Typography>
                  </Button>
                  <Typography variant="caption">— retire ta réaction</Typography>
                </Box>

                {/* Basics */}
                {catalog.basic.length > 0 && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Emojis de base
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {catalog.basic.map((e) => (
                        <EmojiItem key={e.id} emoji={e} />
                      ))}
                    </Box>
                  </>
                )}

                {/* Payants actifs */}
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Emojis à débloquer
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {catalog.actives_paid.map((e) => (
                    <EmojiItem key={e.id} emoji={e} />
                  ))}
                </Box>

                {/* Bouton unique */}
                <Box sx={{ mt: 3 }}>{ButtonOne}</Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Modale d’achat */}
      {purchaseTarget && (
        <PurchaseEmojiModal
          open={!!purchaseTarget}
          emoji={purchaseTarget}
          onCancel={() => setPurchaseTarget(null)}
          onUnlocked={() => onPurchaseSuccess(purchaseTarget)}
        />
      )}
    </Box>
  );
}
