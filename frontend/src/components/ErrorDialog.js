import React from 'react';
import { useError } from './ErrorContext';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Slide from '@mui/material/Slide';

const Transition = React.forwardRef(function Transition(
  props,
  ref
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const ErrorDialog = () => {
  const { error, setError } = useError();

  const handleClose = () => {
    setError(null);
    window.location.reload();
  };

  let title = "Erreur";
  let message = error;

  if (typeof error === "object" && error !== null) {
    title = error.title || title;
    message = error.message || message;
  }

  return (
    <Dialog
      open={!!error}
      TransitionComponent={Transition}
      keepMounted
      onClose={handleClose}
      aria-describedby="error-dialog-description"
      fullWidth
      PaperProps={{ sx: { borderRadius: "26px", paddingBottom: "20px" } }}
    >
      <DialogTitle style={{ fontSize: '2.8rem', fontFamily: 'Dosis', fontWeight: 800 }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="error-dialog-description" style={{ fontSize: '16px' }}>
          {message}
        </DialogContentText>
      </DialogContent>
      <DialogActions style={{ justifyContent: 'center' }}>
        <button onClick={handleClose} className="btn-primary" style={{ color: 'white' }}>
          <span>Fermer</span>
        </button>
      </DialogActions>
    </Dialog>
  );
};

export default ErrorDialog;
