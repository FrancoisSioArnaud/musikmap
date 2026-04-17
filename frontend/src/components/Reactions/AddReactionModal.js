import React, { useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import MusicNote from "@mui/icons-material/MusicNote";

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import AuthModal from "../Auth/AuthModal";
import { buildRelativeLocation, clearAuthReturnContext, saveAuthReturnContext } from "../Auth/AuthFlow";

const EMOJI_POINTS_MESSAGE = "Tu n’as assez de points pour débloquer cet émoji. Les dépôts te font gagner des points.";

export default function AddReactionModal({
  open,
  onClose,
  depPublicKey,
  currentEmoji = null,
  onApplied,
  setUser,
  viewer,
}) {
  const location = useLocation();
  const userContext = useContext(UserContext) || {};
  const effectiveViewer = viewer || userContext.user || null;
  const [loading, setLoading] = useState(false);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);
  const [catalog, setCatalog] = useState({
    actives_paid: [],
    owned_ids: [],
    current_reaction: null,
  });
  const [selected, setSelected] = useState(currentEmoji);
  const [unlockTargetId, setUnlockTargetId] = useState(null);
  const [purchasePromptOpen, setPurchasePromptOpen] = useState(false);
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);
  const [inlineAlert, setInlineAlert] = useState({ severity: "error", message: "", retryAction: "" });
  const [pointsDialogOpen, setPointsDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const loadCatalog = async () => {
      setLoading(true);
      setInlineAlert({ severity: "error", message: "", retryAction: "" });
      try {
        const query = depPublicKey
          ? `?dep_public_key=${encodeURIComponent(depPublicKey)}`
          : "";
        const res = await fetch(`/box-management/emojis/catalog${query}`, {
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
        if (!cancelled) {
          setInlineAlert({
            severity: "error",
            message: "Oops, impossible de charger les réactions. Réessaie dans un instant.",
            retryAction: "reload_catalog",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [open, currentEmoji, depPublicKey, catalogReloadKey]);

  useEffect(() => {
    if (!open) {
      setUnlockTargetId(null);
      setPurchasePromptOpen(false);
      setSubmittingPurchase(false);
      setInlineAlert({ severity: "error", message: "", retryAction: "" });
      setPointsDialogOpen(false);
    }
  }, [open]);

  const initialEmoji = useMemo(
    () => currentEmoji ?? catalog.current_reaction?.emoji ?? null,
    [currentEmoji, catalog.current_reaction]
  );

  const hasChanged = selected !== initialEmoji;

  if (!open) return null;

  const isOwned = (emoji) =>
    emoji?.cost === 0 || (emoji?.id && catalog.owned_ids.includes(emoji.id));

  const openPurchasePrompt = () => {
    saveAuthReturnContext({
      returnTo: buildRelativeLocation(location),
      authContext: "unlock_reaction",
      action: {
        type: "reactions",
        payload: { depPublicKey },
      },
    });
    setUnlockTargetId(null);
    setPurchasePromptOpen(true);
  };

  const onClickEmoji = (emoji) => {
    setInlineAlert({ severity: "error", message: "", retryAction: "" });
    const alreadyOwned = isOwned(emoji);

    if (!alreadyOwned) {
      if (!effectiveViewer?.id || effectiveViewer?.is_guest) {
        openPurchasePrompt();
        return;
      }
      setUnlockTargetId((prev) => (prev === emoji.id ? prev : emoji.id));
      return;
    }

    setUnlockTargetId(null);
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
      setUnlockTargetId(null);
      setSelected(emoji.char);
    } else {
      setUnlockTargetId(null);
    }
  };

  const unlockEmoji = async (emoji) => {
    if (!emoji?.id || submittingPurchase) return;

    if (!effectiveViewer?.id || effectiveViewer?.is_guest) {
      openPurchasePrompt();
      return;
    }

    setSubmittingPurchase(true);
    setInlineAlert({ severity: "error", message: "", retryAction: "" });
    try {
      const res = await fetch("/box-management/emojis/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        credentials: "same-origin",
        body: JSON.stringify({ emoji_id: emoji.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof data?.points_balance === "number" && setUser) {
          setUser((u) => ({ ...(u || {}), points: data.points_balance }));
        }
        if (data?.error === "insufficient_funds") {
          setPointsDialogOpen(true);
          return;
        }

        setInlineAlert({
          severity: "error",
          message: data?.detail || data?.message || "Impossible de débloquer cet emoji.",
          retryAction: "retry_unlock",
        });
        return;
      }

      onPurchaseSuccess({ emoji, points_balance: data?.points_balance });
    } catch (error) {
      setInlineAlert({
        severity: "error",
        message: "Impossible de débloquer cet emoji.",
        retryAction: "retry_unlock",
      });
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const validate = async () => {
    if (!hasChanged) return onClose();
    if (!depPublicKey) {
      setInlineAlert({
        severity: "error",
        message: "Impossible d’appliquer la réaction : dépôt introuvable.",
        retryAction: "",
      });
      return;
    }

    setInlineAlert({ severity: "error", message: "", retryAction: "" });
    const csrftoken = getCookie("csrftoken");

    const emojiId =
      selected === null
        ? null
        : [...(catalog.actives_paid || [])].find((e) => e.char === selected)?.id ??
          null;

    try {
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
          setInlineAlert({
            severity: "warning",
            message: data?.message || "Tu n’as pas débloqué cet emoji.",
            retryAction: "",
          });
        } else {
          setInlineAlert({
            severity: "error",
            message: data?.detail || data?.message || "Oops, impossible d’appliquer ta réaction.",
            retryAction: "retry_validate",
          });
        }
        return;
      }

      onApplied?.(data);
      setCatalog((prev) => ({
        ...prev,
        current_reaction: data?.my_reaction || null,
      }));
      setSelected(data?.my_reaction?.emoji || null);
      setUnlockTargetId(null);
      onClose();
    } catch (error) {
      setInlineAlert({
        severity: "error",
        message: "Oops, impossible d’appliquer ta réaction.",
        retryAction: "retry_validate",
      });
    }
  };

  return (
    <>
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
          <Card
            sx={{ borderRadius: 4 }}
            className="modal"
            onClick={() => {
              if (unlockTargetId) setUnlockTargetId(null);
            }}
          >
            <CardContent>
              <Box className="intro_small">
                <Typography component="h1" variant="h1">
                  Réagir
                </Typography>
                <Typography variant="body1">
                  Choisis un emoji pour dire ce que tu as pensé de la chanson.
                </Typography>
              </Box>

              {inlineAlert.message ? (
                <Alert
                  severity={inlineAlert.severity}
                  sx={{ mb: 2 }}
                  action={
                    inlineAlert.retryAction ? (
                      <Button
                        variant="light"
                        onClick={() => {
                          if (inlineAlert.retryAction === "reload_catalog") {
                            setCatalogReloadKey((prev) => prev + 1);
                            return;
                          }

                          if (inlineAlert.retryAction === "retry_unlock") {
                            const emoji = (catalog.actives_paid || []).find((item) => item.id === unlockTargetId);
                            if (emoji) {
                              unlockEmoji(emoji);
                            }
                            return;
                          }

                          if (inlineAlert.retryAction === "retry_validate") {
                            validate();
                          }
                        }}
                      >
                        Réessayer
                      </Button>
                    ) : null
                  }
                >
                  {inlineAlert.message}
                </Alert>
              ) : null}

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
                      const isUnlockOpen = unlockTargetId === emoji.id;

                      const itemClass = `react_item_wrap ${
                        isSelected ? "selected" : ""
                      } ${!owned ? "react_notOwned" : ""} ${
                        emoji.cost === 0 ? "react_free" : ""
                      } ${isUnlockOpen ? "unlock_open" : ""}`;

                      return (
                        <Box key={emoji.id} className={itemClass}>
                          <Button
                            onClick={(event) => {
                              event.stopPropagation();
                              onClickEmoji(emoji);
                            }}
                            aria-label={`Emoji ${emoji.char}`}
                            className="react_item"
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

                          {isUnlockOpen ? (
                            <Box
                              className="unlock_cta"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Button
                                className="unlock_cta_button"
                                variant="contained"
                                disabled={submittingPurchase}
                                onClick={() => unlockEmoji(emoji)}
                              >
                                Débloquer
                              </Button>
                            </Box>
                          ) : null}
                        </Box>
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
      </Box>

      <AuthModal
        open={purchasePromptOpen}
        onClose={() => { clearAuthReturnContext(); setPurchasePromptOpen(false); }}
        initialTab="register"
        authContext="unlock_reaction"
        mergeGuest={Boolean(effectiveViewer?.is_guest)}
        prefillUsername={effectiveViewer?.is_guest ? (effectiveViewer?.username || "") : ""}
        authAction={{
          type: "reactions",
          payload: { depPublicKey },
        }}
        onAuthenticated={() => setPurchasePromptOpen(false)}
      />

      <Dialog open={pointsDialogOpen} onClose={() => setPointsDialogOpen(false)}>
        <DialogTitle>Pas assez de points</DialogTitle>
        <DialogContent>
          <Alert severity="warning">{EMOJI_POINTS_MESSAGE}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPointsDialogOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
