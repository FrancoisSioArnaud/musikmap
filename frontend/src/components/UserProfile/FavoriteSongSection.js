import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import SearchIcon from "@mui/icons-material/Search";
import FavoriteIcon from "@mui/icons-material/Favorite";
import Typography from "@mui/material/Typography";
import RemoveCircleOutlineOutlinedIcon from "@mui/icons-material/RemoveCircleOutlineOutlined";

import Deposit from "../Common/Deposit";
import SearchPanel from "../Common/Search/SearchPanel";
import { resolveInitialSelectedProvider, NO_PERSONALIZED_RESULTS_PROVIDER } from "../Common/Search/SearchProviderSelector";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { buildRelativeLocation, consumeAuthAction, startAuthPageFlow } from "../Auth/AuthFlow";

export default function FavoriteSongSection({
  profileUser,
  isOwner,
  isGuestOwner = false,
  initialFavoriteDeposit = null,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useContext(UserContext) || {};

  const [favoriteDeposit, setFavoriteDeposit] = useState(initialFavoriteDeposit || null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [depositFlowState, setDepositFlowState] = useState({
    requestKey: null,
    status: "idle",
    errorMessage: null,
  });
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "Erreur", message: "" });
  const [removingFavorite, setRemovingFavorite] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setFavoriteDeposit(initialFavoriteDeposit || null);
  }, [initialFavoriteDeposit]);

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const initialSelectedProvider = resolveInitialSelectedProvider(user);
    if (initialSelectedProvider !== NO_PERSONALIZED_RESULTS_PROVIDER) return undefined;

    const timer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 60);
    return () => clearTimeout(timer);
  }, [drawerOpen, user?.id, user?.provider_connections]);

  const openDrawer = () => {
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (!user?.id || user?.is_guest) return;
    const pendingAction = consumeAuthAction({
      currentPath: buildRelativeLocation(location),
      actionType: "favorite_song",
    });
    if (pendingAction) {
      openDrawer();
    }
  }, [location, openDrawer, user?.id, user?.is_guest]);

  const closeDrawer = useCallback((force = false) => {
    if (depositFlowState.status === "pending" && !force) return;
    setDrawerOpen(false);
    setDepositFlowState({
      requestKey: null,
      status: "idle",
      errorMessage: null,
    });
  }, [depositFlowState.status]);

  const syncCurrentUser = useCallback((payload) => {
    if (!payload || !setUser) return;
    setUser(payload);
  }, [setUser]);

  const openErrorDialog = useCallback((title, message) => {
    setErrorDialog({ open: true, title, message });
  }, []);

  const handleSetFavorite = useCallback(async (option, requestKey) => {
    if (depositFlowState.status === "pending") return;

    setDepositFlowState({
      requestKey,
      status: "pending",
      errorMessage: null,
    });

    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch("/users/set-favorite-song", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
          Accept: "application/json",
        },
        body: JSON.stringify({ option }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data?.detail || "Impossible d’enregistrer cette chanson de coeur.";
        openErrorDialog("Impossible d’enregistrer la chanson de cœur", message);
        setDepositFlowState({
          requestKey,
          status: "error",
          errorMessage: message,
        });
        return;
      }

      setFavoriteDeposit(data?.favorite_deposit || null);
      syncCurrentUser(data?.current_user || null);
      setDepositFlowState({
        requestKey,
        status: "success",
        errorMessage: null,
      });
    } catch {
      const message = "Impossible d’enregistrer cette chanson de coeur.";
      openErrorDialog("Impossible d’enregistrer la chanson de cœur", message);
      setDepositFlowState({
        requestKey,
        status: "error",
        errorMessage: message,
      });
    }
  }, [depositFlowState.status, openErrorDialog, syncCurrentUser]);

  const handleDepositVisualComplete = useCallback((requestKey) => {
    if (depositFlowState.requestKey !== requestKey || depositFlowState.status !== "success") {
      return;
    }

    closeDrawer(true);
  }, [closeDrawer, depositFlowState.requestKey, depositFlowState.status]);

  const handleRemoveFavorite = useCallback(async () => {
    if (removingFavorite) return;

    setRemovingFavorite(true);
    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch("/users/remove-favorite-song", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
          Accept: "application/json",
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        openErrorDialog(
          "Impossible de retirer la chanson de cœur",
          data?.detail || "Impossible de retirer la chanson de coeur."
        );
        return;
      }
      setFavoriteDeposit(null);
      syncCurrentUser(data?.current_user || null);
      closeDrawer();
    } catch {
      openErrorDialog("Impossible de retirer la chanson de cœur", "Impossible de retirer la chanson de coeur.");
    } finally {
      setRemovingFavorite(false);
    }
  }, [closeDrawer, openErrorDialog, removingFavorite, syncCurrentUser]);

  const displayName = profileUser?.display_name || profileUser?.username || "Cet utilisateur";
  const isCurrentFullUser = Boolean(isOwner && !isGuestOwner && user?.id);
  const hasFavorite = Boolean(favoriteDeposit?.public_key);
  const showOwnerActions = Boolean(isCurrentFullUser && hasFavorite);

  const bodyContent = useMemo(() => {
    if (isCurrentFullUser) {
      return "Ta chanson de cœur est visible par tout le monde";
    }

    if (!hasFavorite) {
      return null;
    }

    return `${displayName} a épinglé cette chanson à son profil`;
  }, [displayName, hasFavorite, isCurrentFullUser]);

  const slotContent = useMemo(() => {
    if (isGuestOwner) {
      return (
        <>
          <Typography variant="body1" sx={{ textAlign: "center", mb: 2 }}>
            Crée ton compte pour pouvoir attacher une chanson à ton profil.
          </Typography>
          <Button
            variant="contained"
            onClick={() =>
              startAuthPageFlow({
                navigate,
                location,
                tab: "register",
                authContext: "favorite_song",
                mergeGuest: true,
                prefillUsername: user?.username || "",
                action: { type: "favorite_song", payload: {} },
              })
            }
          >
            Créer mon compte
          </Button>
        </>
      );
    }

    if (isCurrentFullUser) {
      return (
        <Button variant="light" onClick={openDrawer} startIcon={<SearchIcon />}>
          Choisir ta chanson
        </Button>
      );
    }

    return (
      <Typography variant="body1" sx={{ textAlign: "center" }}>
        {displayName} n&apos;a pas épinglé de chanson à son profil
      </Typography>
    );
  }, [displayName, isCurrentFullUser, isGuestOwner, navigate, openDrawer, user?.username]);

  return (
    <>
      <Box className="favorite_song_section">
        <Box className="icon_container info_box">
          <FavoriteIcon />
        </Box>

        <Box className="favorite_song_container">
          <Box
            sx={{
              display: "grid",
              gap: 2,
              px: 2.5,
              pb: "16px",
            }}
          >
            <Typography variant="h4">Chanson de coeur</Typography>
            {bodyContent ? (
              <Typography component="p" variant="body1">
                {bodyContent}
              </Typography>
            ) : null}

            {showOwnerActions ? (
              <Box className="favorite_song_actions">
                <Button variant="light" onClick={openDrawer} startIcon={<SearchIcon />}>
                  Changer
                </Button>
                <Button
                  variant="light"
                  onClick={handleRemoveFavorite}
                  startIcon={<RemoveCircleOutlineOutlinedIcon />}
                  sx={{ color: "var(--mm-color-error)" }}
                  disabled={removingFavorite}
                >
                  Supprimer
                </Button>
              </Box>
            ) : null}
          </Box>

          {hasFavorite ? (
            <Deposit
              dep={favoriteDeposit}
              user={user}
              variant="list"
              showUser={false}
              showDate={false}
              fitContainer
            />
          ) : (
            <Box className="slot">{slotContent}</Box>
          )}

          <Drawer
            anchor="right"
            open={drawerOpen}
            onClose={closeDrawer}
            PaperProps={{
              sx: {
                width: "100vw",
                maxWidth: "100vw",
                height: "100vh",
                overflow: "hidden",
              },
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ p: 5, pb: 2 }}>
                <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
                  Choisis une chanson de coeur
                </Typography>
              </Box>

              {drawerOpen ? (
                <SearchPanel
                  inputRef={searchInputRef}
                  onSelectSong={handleSetFavorite}
                  onDepositVisualComplete={handleDepositVisualComplete}
                  actionLabel="Choisir"
                  depositFlowState={depositFlowState}
                  rootSx={{ flex: 1, minHeight: 0 }}
                  searchBarWrapperSx={{ px: 5, pb: 2 }}
                  contentSx={{ overflowX: "hidden", overflowY: "scroll", flex: 1, pb: "96px" }}
                />
              ) : null}

              <Button
                variant="contained"
                onClick={() => closeDrawer()}
                className="bottom_fixed"
              >
                Fermer
              </Button>
            </Box>
          </Drawer>
        </Box>
      </Box>

      <Dialog open={errorDialog.open} onClose={() => setErrorDialog({ open: false, title: "Erreur", message: "" })}>
        <DialogTitle>{errorDialog.title}</DialogTitle>
        <DialogContent>
          <Alert severity="error">{errorDialog.message}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setErrorDialog({ open: false, title: "Erreur", message: "" })}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
