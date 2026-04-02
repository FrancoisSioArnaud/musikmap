import React, { useEffect, useMemo, useState } from "react";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import MusicNote from "@mui/icons-material/MusicNote";

import { getCookie } from "../Security/TokensUtils";
import PurchaseEmojiModal from "./PurchaseEmojiModal";

export default function AddReactionModal({
  open,
  onClose,
  depPublicKey,
  currentEmoji = null,
  onApplied,
  setUser,
}) {
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState({
    actives_paid: [],
    owned_ids: [],
    current_reaction: null,
  });
  const [selected, setSelected] = useState(currentEmoji);
  const [purchaseTarget, setPurchaseTarget] = useState(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadCatalog = async () => {
      setLoading(true);
      try {
        const res = await fetch("/box-management/emojis/catalog", {
          credentials: "same-origin",
        });
        const data = await res.json();
        if (!cancelled) {
          setCatalog({
            actives_paid: data.actives_paid || [],
            owned_ids: data.owned_ids || [],
            current_reaction: data.current_reaction || null,
          });
          setSelected(currentEmoji ?? data.current_reaction?.emoji ?? null);
        }
      } catch (error) {
        alert("Impossible de charger les réactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [open, currentEmoji]);

  const initialEmoji = useMemo(
    () => currentEmoji ?? catalog.current_reaction?.emoji ?? null,
    [currentEmoji, catalog.current_reaction]
  );

  const hasChanged = selected !== initialEmoji;

  if (!open) return null;

  const isOwned = (emoji) =>
    emoji?.cost === 0 || (emoji?.id && catalog.owned_ids.includes(emoji.id));

  const onClickEmoji = (emoji) => {
    const alreadyOwned = isOwned(emoji);

    if (!alreadyOwned) {
      setPurchaseTarget(emoji);
      return;
    }

    setSelected((prev) => (prev === emoji.char ? null : emoji.char));
  };

  const onPurchaseSuccess = ({ emoji, points_balance }) => {
    if (typeof points_balance === "number" && setUser) {
      setUser((u) => ({ ...(u || {}), points: points_balance }));
    }
    if (emoji?.id) {
      setCatalog((prev) => ({
        ...prev,
        owned_ids: [...new Set([...(prev.owned_ids || []), emoji.id])],
      }));
      setPurchaseTarget(null);
      setSelected(emoji.char);
    } else {
      setPurchaseTarget(null);
    }
  };

  const validate = async () => {
    if (!hasChanged) return onClose();
    if (!depPublicKey) {
      alert("Impossible d’appliquer la réaction : dépôt introuvable.");
      return;
    }

    const csrftoken = getCookie("csrftoken");

    const emojiId =
      selected === null
        ? null
        : [...(catalog.actives_paid || [])].find((e) => e.char === selected)?.id ??
          null;

    const res = await fetch("/box-management/reactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrftoken,
      },
      credentials: "same-origin",
      body: JSON.stringify({
        dep_public_key: depPublicKey,
        emoji_id: emojiId,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (data?.error === "forbidden") {
        alert("Tu n’as pas débloqué cet emoji.");
      } else {
        alert("Oops, impossible d’appliquer ta réaction.");
      }
      return;
    }

    onApplied?.(data);
    setCatalog((prev) => ({
      ...prev,
      current_reaction: data?.my_reaction || null,
    }));
    setSelected(data?.my_reaction?.emoji || null);
    onClose();
  };

  return (
    <Box
      onClick={onClose}
      sx={{
        position: "fixed",
        inset: 0,
        bgcolor: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 5,
        zIndex: 1300,
      }}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        sx={{ width: "100%", maxWidth: 560 }}
      >
        <Card sx={{ borderRadius: 4 }} className="modal">
          <CardContent>
            <Box className="intro_small">
              <Typography component="h1" variant="h1">
                Réagir
              </Typography>
              <Typography variant="body1">
                Choisis un emoji pour dire ce que tu as pensé de la chanson.
              </Typography>
            </Box>
            {loading ? (
              <Box>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Box className="react_list">
                  {catalog.actives_paid.map((emoji) => {
                    const owned = isOwned(emoji);
                    const isSelected = selected === emoji.char;

                    const buttonClass = `react_item ${
                      isSelected ? "selected" : ""
                    } ${!owned ? "react_notOwned" : ""} ${
                      emoji.cost === 0 ? "react_free" : ""
                    }`;

                    return (
                      <Button
                        key={emoji.id}
                        onClick={() => onClickEmoji(emoji)}
                        aria-label={`Emoji ${emoji.char}`}
                        className={buttonClass}
                      >
                        <span className="react_emoji">{emoji.char}</span>

                        {!owned && emoji.cost > 0 && (
                          <Box className="points_container">
                            <Typography variant="body2" component="span">
                              {emoji.cost}
                            </Typography>
                            <MusicNote />
                          </Box>
                        )}
                      </Button>
                    );
                  })}
                </Box>

                <Box>
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
