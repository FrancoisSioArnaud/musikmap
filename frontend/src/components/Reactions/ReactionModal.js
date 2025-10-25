import React, { useEffect, useMemo, useState } from "react";
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
 */
export default function ReactionModal({ open, onClose, depositId, currentEmoji, onApplied }) {
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState({ basic: [], actives_paid: [], owned_ids: [] });
  const [selected, setSelected] = useState(currentEmoji || null);
  const [purchaseTarget, setPurchaseTarget] = useState(null); // emoji object à acheter

  const hasChanged = useMemo(() => (selected || null) !== (currentEmoji || null), [selected, currentEmoji]);

  useEffect(() => {
    setSelected(currentEmoji || null);
  }, [currentEmoji, open]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    async function run() {
      setLoading(true);
      try {
        const res = await fetch("/box-management/emojis/catalog", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (mounted) setCatalog({
          basic: Array.isArray(data?.basic) ? data.basic : [],
          actives_paid: Array.isArray(data?.actives_paid) ? data.actives_paid : [],
          owned_ids: Array.isArray(data?.owned_ids) ? data.owned_ids : [],
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => { mounted = false; };
  }, [open]);

  if (!open) return null;

  const isOwned = (emoji) => emoji?.basic || catalog.owned_ids.includes(emoji?.id);

  const onClickEmoji = (emoji) => {
    if (!emoji) { setSelected(null); return; } // none
    if (isOwned(emoji)) {
      setSelected(emoji.char);
    } else {
      setPurchaseTarget(emoji);
    }
  };

  const onPurchaseSuccess = (emoji) => {
    // Marque comme possédé localement
    setCatalog((prev) => ({ ...prev, owned_ids: [...new Set([...(prev.owned_ids || []), emoji.id])] }));
    setPurchaseTarget(null);
    setSelected(emoji.char);
  };

  const validate = async () => {
    if (!hasChanged) { onClose(); return; }
    const csrftoken = getCookie("csrftoken");

    const payload = {
      deposit_id: depositId,
      emoji_id: selected === null ? null : (
        // retrouver l'id par char
        [...catalog.basic, ...catalog.actives_paid].find(e => e.char === selected)?.id ?? null
      ),
    };

    const res = await fetch("/box-management/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.error === "forbidden") alert("Tu n’as pas débloqué cet emoji.");
      else alert("Oops, impossible d’appliquer ta réaction pour le moment.");
      return;
    }
    onApplied?.(data); // { my_reaction, reactions_summary }
    onClose();
  };

  const EmojiItem = ({ emoji, owned }) => {
    const disabled = !owned;
    return (
      <Button
        onClick={() => onClickEmoji(emoji)}
        aria-label={`Emoji ${emoji.char}${owned ? "" : " non débloqué"}`}
        title={owned ? `Utiliser ${emoji.char}` : `${emoji.char} — ${emoji.cost} points`}
        disabled={false}
        sx={{
          minWidth: 48, minHeight: 48, borderRadius: 2, border: '1px solid',
          borderColor: selected === emoji.char ? 'primary.main' : 'divider',
          opacity: owned ? 1 : 0.4,
        }}
      >
        <span style={{ fontSize: 22 }}>{emoji.char}</span>
      </Button>
    );
  };

  return (
    <Box
      onClick={onClose}
      sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", p: 2, zIndex: 1300 }}
    >
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 560 }}>
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography component="h1" variant="h5" sx={{ mb: 1 }}>Réagir</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Choisis un emoji pour dire à l’artiste ce que tu as pensé de sa chanson.
            </Typography>

            {loading ? (
              <Box sx={{ py: 4, textAlign: "center" }}><CircularProgress /></Box>
            ) : (
              <>
                {/* None */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Button
                    onClick={() => onClickEmoji(null)}
                    aria-label="Aucune réaction"
                    sx={{
                      border: '1px dashed', borderColor: selected === null ? 'primary.main' : 'divider',
                      borderRadius: 2, px: 1.5, py: 0.75,
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
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Emojis de base</Typography>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {catalog.basic.map((e) => (
                        <EmojiItem key={e.id} emoji={e} owned={true} />
                      ))}
                    </Box>
                  </>
                )}

                {/* Payants */}
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Emojis à débloquer</Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {catalog.actives_paid.map((e) => (
                    <EmojiItem key={e.id} emoji={e} owned={isOwned(e)} />
                  ))}
                </Box>

                {/* Footer boutons */}
                <Box sx={{ display: "flex", gap: 1.5, mt: 3 }}>
                  <Button variant="outlined" fullWidth onClick={onClose}>Sortir</Button>
                  <Button variant="contained" fullWidth disabled={!hasChanged} onClick={validate}>
                    Valider
                  </Button>
                </Box>
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
