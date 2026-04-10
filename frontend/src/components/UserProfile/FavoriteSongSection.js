import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";

import Deposit from "../Common/Deposit";
import SongSearchResultsList from "../Common/SongSearchResultsList";
import useSongSearch from "../Common/useSongSearch";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";

const SLOW_PROGRESS_TARGET = 78;
const SLOW_PROGRESS_DURATION_MS = 2800;
const FAST_PROGRESS_DURATION_MS = 700;
const MIN_VISUAL_DURATION_MS = 600;
const SUCCESS_HOLD_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function FavoriteSongSection({
  profileUser,
  isOwner,
  isGuestOwner = false,
  initialFavoriteDeposit = null,
}) {
  const navigate = useNavigate();
  const { user, setUser } = useContext(UserContext) || {};

  const [favoriteDeposit, setFavoriteDeposit] = useState(initialFavoriteDeposit || null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postingId, setPostingId] = useState(null);
  const [postingProgress, setPostingProgress] = useState(0);
  const [postingTransitionMs, setPostingTransitionMs] = useState(0);
  const searchInputRef = useRef(null);

  const {
    searchValue,
    setSearchValue,
    results,
    isSearching,
    resetSearch,
  } = useSongSearch();

  useEffect(() => {
    setFavoriteDeposit(initialFavoriteDeposit || null);
  }, [initialFavoriteDeposit]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const timer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 60);
    return () => clearTimeout(timer);
  }, [drawerOpen]);

  const openDrawer = () => {
    setDrawerOpen(true);
  };

  const closeDrawer = useCallback((force = false) => {
    if (posting && !force) return;
    setDrawerOpen(false);
    resetSearch();
    setPosting(false);
    setPostingId(null);
    setPostingProgress(0);
    setPostingTransitionMs(0);
  }, [posting, resetSearch]);

  const syncCurrentUser = useCallback((payload) => {
    if (!payload || !setUser) return;
    setUser(payload);
  }, [setUser]);

  const handleSetFavorite = useCallback(async (option) => {
    if (posting) return;

    const startedAt = Date.now();
    const itemId = option?.id ?? "__posting__";

    setPosting(true);
    setPostingId(itemId);
    setPostingProgress(0);
    setPostingTransitionMs(0);

    requestAnimationFrame(() => {
      setPostingTransitionMs(SLOW_PROGRESS_DURATION_MS);
      setPostingProgress(SLOW_PROGRESS_TARGET);
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
        window.alert(data?.detail || data?.errors?.[0] || "Impossible d’enregistrer cette chanson de coeur.");
        setPosting(false);
        setPostingId(null);
        setPostingProgress(0);
        setPostingTransitionMs(0);
        return;
      }

      const elapsed = Date.now() - startedAt;
      const remainingMinVisual = Math.max(0, MIN_VISUAL_DURATION_MS - elapsed);
      if (remainingMinVisual > 0) {
        await sleep(remainingMinVisual);
      }

      setPostingTransitionMs(FAST_PROGRESS_DURATION_MS);
      setPostingProgress(100);
      await sleep(FAST_PROGRESS_DURATION_MS + SUCCESS_HOLD_MS);

      setFavoriteDeposit(data?.favorite_deposit || null);
      syncCurrentUser(data?.current_user || null);
      closeDrawer(true);
    } catch {
      window.alert("Impossible d’enregistrer cette chanson de coeur.");
      setPosting(false);
      setPostingId(null);
      setPostingProgress(0);
      setPostingTransitionMs(0);
    }
  }, [closeDrawer, posting, syncCurrentUser]);

  const handleRemoveFavorite = useCallback(async () => {
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
        window.alert(data?.detail || data?.errors?.[0] || "Impossible de retirer la chanson de coeur.");
        return;
      }
      setFavoriteDeposit(null);
      syncCurrentUser(data?.current_user || null);
      closeDrawer();
    } catch {
      window.alert("Impossible de retirer la chanson de coeur.");
    }
  }, [closeDrawer, syncCurrentUser]);

  const displayName = profileUser?.display_name || profileUser?.username || "Cet utilisateur";
  const isCurrentFullUser = Boolean(isOwner && !isGuestOwner && user?.id);
  const hasFavorite = Boolean(favoriteDeposit?.public_key);
  const canRemove = Boolean(hasFavorite);
  const showSearchButton = isCurrentFullUser;
  const searchButtonLabel = hasFavorite ? "Changer" : "Ajouter";

  const drawerEmptyContent = useMemo(() => {
    if (!searchValue.trim()) {
      return canRemove ? (
        <Box sx={{ p: "16px 20px" }}>
          <Button
            size="fullwidth"
            variant="text"
            onClick={handleRemoveFavorite}
            startIcon={<RemoveCircleOutlineIcon />}
            sx={{ px: "auto" }}
          >
            Retirer ma chanson de coeur
          </Button>
        </Box>
      ) : null;
    }

    return (
      <Box sx={{ px: 5, py: 3 }}>
        <Typography variant="body1">Aucun résultat.</Typography>
      </Box>
    );
  }, [canRemove, handleRemoveFavorite, searchValue]);

  const emptySlotContent = useMemo(() => {
    if (isGuestOwner) {
      return (
        <>
          <Typography variant="body1" sx={{ textAlign: "center", mb: 2 }}>
            Finalise ton compte pour pouvoir attacher une chanson à ton profil.
          </Typography>
          <Button
            variant="contained"
            onClick={() =>
              navigate(
                `/register?merge_guest=1&prefill_username=${encodeURIComponent(
                  user?.username || ""
                )}`
              )
            }
          >
            Finalise ton compte
          </Button>
        </>
      );
    }

    if (isCurrentFullUser) {
      return (
        <Typography variant="body1" sx={{ textAlign: "center" }}>
          Attache une chanson à ton profil, elle sera visible par tout ceux qui le visiteront
        </Typography>
      );
    }

    return (
      <Typography variant="body1" sx={{ textAlign: "center" }}>
        {displayName} n&apos;a pas encore attaché de chanson à son profil
      </Typography>
    );
  }, [displayName, isCurrentFullUser, isGuestOwner, navigate, user?.username]);

  return (
    <Box className="favorite">
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          pb: "8px",
        }}
      >
        <Typography variant="h5">Chanson de coeur</Typography>
        {showSearchButton ? (
          <Button variant="light" onClick={openDrawer} startIcon={<SearchIcon />}>
            {searchButtonLabel}
          </Button>
        ) : null}
      </Box>

      {hasFavorite ? (
        !isOwner ? (
          <>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {displayName} a attaché cette chanson à son profil
            </Typography>
            <Deposit
              dep={favoriteDeposit}
              user={user}
              variant="list"
              showUser={false}
              showDate={false}
              fitContainer
            />
          </>
        ) : (
          <Deposit
            dep={favoriteDeposit}
            user={user}
            variant="list"
            showUser={false}
            showDate={false}
            fitContainer
          />
        )
      ) : (
        <Box className="slot">
          {emptySlotContent}
        </Box>
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

            <TextField
              inputRef={searchInputRef}
              fullWidth
              type="search"
              placeholder="Chercher une chanson"
              value={searchValue}
              className="searchfield"
              onChange={(event) => setSearchValue(event.target.value)}
              inputProps={{ inputMode: "search" }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="medium" />
                  </InputAdornment>
                ),
              }}
              sx={{
                borderRadius: "var(--mm-radius-round)",
                "& .MuiInputBase-input": { fontSize: 16 },
              }}
            />
          </Box>

          <Box sx={{ overflowX: "hidden", overflowY: "scroll", flex: 1, pb: "96px" }}>
            <SongSearchResultsList
              results={results}
              isSearching={isSearching}
              posting={posting}
              postingId={postingId}
              postingProgress={postingProgress}
              postingTransitionMs={postingTransitionMs}
              onAction={handleSetFavorite}
              actionLabel="Choisir"
              emptyContent={drawerEmptyContent}
            />
          </Box>

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
  );
}
