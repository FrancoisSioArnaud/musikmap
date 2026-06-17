
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import React from "react";

export default function ConfirmActionDialog({
  open,
  onClose,
  onConfirm,
  title,
  description = "",
  children = null,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  confirmColor = "primary",
  confirmVariant = "contained",
  loading = false,
  fullWidth = true,
  maxWidth = "xs",
  submitOnEnter = false,
}) {
  const handleClose = loading ? undefined : onClose;

  const paperProps = submitOnEnter
    ? {
        component: "form",
        onSubmit: (event) => {
          event.preventDefault();
          if (!loading) {
            onConfirm?.();
          }
        },
      }
    : undefined;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth={fullWidth}
      maxWidth={maxWidth}
      PaperProps={paperProps}
    >
      <DialogTitle>{title}</DialogTitle>
      {(description || children) ? (
        <DialogContent>
          {typeof description === "string" ? (
            description ? <DialogContentText>{description}</DialogContentText> : null
          ) : (
            description
          )}
          {children}
        </DialogContent>
      ) : null}
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          type={submitOnEnter ? "submit" : "button"}
          onClick={submitOnEnter ? undefined : onConfirm}
          color={confirmColor}
          variant={confirmVariant}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
