import React, { useEffect, useMemo, useState, useContext } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import AlbumIcon from "@mui/icons-material/Album";

import { getCookie } from "../Security/TokensUtils";
import PurchaseEmojiModal from "./PurchaseEmojiModal";
import { UserContext } from "../UserContext";

export default function ReactionModal({ open, onClose, depositId, currentEmoji, onApplied }) {
  const { setUser } = useContext(UserContext) || {};
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState({ basic: [], actives_paid: [], owned_ids: [], current_reaction: null });
  const [selected, setSelected] = useState(currentEmoji || null);
  const [purchaseTarget, setPurchaseTarget] = useState(null);

  const hasChanged = useMemo(
    () => (selected || null) !== (catalog.current_reaction?.emoji || null),
    [selected, catalog]
  );

  useEffect(() => {
    if (!open) return;
    let mounted = true;

    async function run() {
      setLoading(true);
      try {
        const res = await fetch(`/box-management/emojis/catalog?deposit_id=${depositId}`, { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        setCatalog({
          basic: data?.basic || [],
          actives_paid: data?.actives_paid || [],
          owned_ids: data?.owned_ids || [],
          current_reaction: data?.current_reaction || null,
        });
        setSelected(data?.current_reaction?.emoji || null);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    run();
    return () => { mounted = false; };
  }, [open, depositId]);

  if (!open) return null;

  const isOwned = (emoji) => emoji.basic || emoji.cost === 0 || catalog.owned_ids.includes(emoji.id);

  const onClickEmoji = (emoji) => {
    if (!emoji) {
      setSelected(null);
      return;
    }
    if (isOwned(emoji)) setSelected(emoji.char);
    else setPurchaseTarget(emoji);
  };

  const onPurchaseSuccess = (payload) => {
    const { emoji, points_balance } = payload || {};
    if (typeof points_balance === "number" && setUser) {
      setUser((u) => ({ ...(u || {}), points: points_balance }));
    }
    if (emoji?.id) {
      setCatalog((prev) => ({ ...prev, owned_ids: [...new Set([...(prev.owned_ids || []), emoji.id])] }));
      setPurchaseTarget(null);
      setSelected(emoji.char);
    } else {
      setPurchaseTarget(null);
    }
  };

  const validate = async () => {
    if (!hasChanged) return onClose();

    const csrftoken = getCookie("csrftoken");
    const emojiId =
      selected === null
        ? null
        : [...(catalog.basic || []), ...(catalog.actives_paid || [])].find((e) => e.char === selected)?.id ?? null;

    const res = await fetch("/box-management/reactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      credentials: "same-origin",
      body: JSON.stringify({ deposit_id: depositId, emoji_id: emojiId }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (data?.error === "forbidden") alert("Tu n’as pas débloqué cet emoji.");
      else alert("Oops, impossible d’appliquer ta réaction.");
      return;
    }

    // ✅ Renvoie au parent (Deposit) -> met à jour my_reaction & reactions_summary
    onApplied?.(data);

    // met à jour l’état local (utile si on rouvre la modale tout de suite)
    setCatalog((prev) => ({ ...prev, current_reaction: data?.my_reaction || null }));
    setSelected(data?.my_reaction?.emoji || null);

    onClose();
  };

  const CostBadge = ({ cost }) => {
    if (!(cost > 0)) return null;
    return (
      <Box className="points_container" sx={{ position: "absolute", bottom: 4, right: 4, display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
          {cost}
        </Typography>
        <AlbumIcon />
      </Box>
    );
  };

  const EmojiItem = ({ emoji, owned }) => {
    const isSelected = selected === emoji.char;
    return (
      <Button
        onClick={() => onClickEmoji(emoji)}
        aria-label={`Emoji ${emoji.char}`}
        sx={{
          minWidth: 48,
          minHeight: 48,
          borderRadius: 2,
          border: "1px solid",
          borderColor: isSelected ? "primary.main" : "divider",
          opacity: owned ? 1 : 0.55,
          position: "relative",
        }}
      >
        <span style={{ fontSize: 22 }}>{emoji.char}</span>
        {!owned && emoji.cost > 0 && <CostBadge cost={emoji.cost} />}
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
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 560 }}>
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography component="h1" variant="h5" sx={{ mb: 1 }}>
              Réagir
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Choisis un emoji pour dire ce que tu as pensé de la chanson.
            </Typography>

            {loading ? (
              <Box sx={{ py: 4, textAlign: "center" }}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                {/* NONE */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Button
                    onClick={() => setSelected(null)}
                    aria-label="Aucune réaction"
                    sx={{
                      border: "1px dashed",
                      borderColor: selected === null ? "primary.main" : "divider",
                      borderRadius: 2,
                      px: 1.5,
                      py: 0.75,
                    }}
                  >
                    <HighlightOffIcon />
                  </Button>
                  <Typography variant="caption">Retirer ma réaction</Typography>
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
                        <EmojiItem key={e.id} emoji={e} owned={true} />
                      ))}
                    </Box>
                  </>
                )}

                {/* Payants */}
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Emojis à débloquer
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {catalog.actives_paid.map((e) => (
                    <EmojiItem key={e.id} emoji={e} owned={isOwned(e)} />
                  ))}
                </Box>

                {/* Bouton unique Sortir/Valider */}
                <Box sx={{ display: "flex", gap: 1.5, mt: 3 }}>
                  <Button
                    variant={hasChanged ? "contained" : "outlined"}
                    fullWidth
                    onClick={hasChanged ? validate : onClose}
                  >
                    {hasChanged ? "Valider" : "Sortir"}
                  </Button>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      </Box>

      {purchaseTarget && (
        <PurchaseEmojiModal
          open={!!purchaseTarget}
          emoji={purchaseTarget}
          onCancel={() => setPurchaseTarget(null)}
          onUnlocked={onPurchaseSuccess}
        />
      )}
    </Box>
  );
}
