import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import InputAdornment from "@mui/material/InputAdornment";
import SearchIcon from "@mui/icons-material/Search";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import MusicNote from "@mui/icons-material/MusicNote";
import PushPinIcon from '@mui/icons-material/PushPin';

import Deposit from "../Common/Deposit";
import SongSearchResultsList from "../Common/SongSearchResultsList";
import useSongSearch from "../Common/useSongSearch";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { getValid, setWithTTL } from "../Utils/mmStorage";

function formatDuration(minutes) {
  const totalMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  if (hours <= 0) return `${mins} min`;
  if (mins <= 0) return `${hours} h`;
  return `${hours} h ${mins}`;
}

function getRemainingMs(dep, nowTs) {
  const expiresAt = dep?.pin_expires_at ? new Date(dep.pin_expires_at).getTime() : 0;
  if (!expiresAt) return 0;
  return Math.max(0, expiresAt - nowTs);
}

function formatRemainingTime(remainingMs) {
  const totalSeconds = Math.max(0, Math.floor((remainingMs || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    if (minutes > 0) return `${hours} h ${minutes} min restantes`;
    return `${hours} h restantes`;
  }
  if (minutes > 0) return `${minutes} min restantes`;
  return `${seconds} s restantes`;
}

function buildPinnedDateLabel(dep) {
  if (!dep?.deposited_at) return "Épinglée";
  const depositedAt = new Date(dep.deposited_at).getTime();
  if (!depositedAt) return "Épinglée";

  const diffMs = Math.max(0, Date.now() - depositedAt);
  const totalMinutes = Math.floor(diffMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);

  if (days > 0) return `Épinglée il y a ${days} j`;
  if (totalHours > 0) return `Épinglée il y a ${totalHours} h`;
  if (totalMinutes > 0) return `Épinglée il y a ${totalMinutes} min`;
  return "Épinglée à l’instant";
}


const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 120;

export default function PinnedSongSection({ boxSlug }) {
  const navigate = useNavigate();
  const { user, setUser } = useContext(UserContext) || {};

  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState("search");
  const [activePinnedDeposit, setActivePinnedDeposit] = useState(null);
  const [priceSteps, setPriceSteps] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  const searchInputRef = useRef(null);

  const {
    searchValue,
    setSearchValue,
    results,
    isSearching,
    resetSearch,
  } = useSongSearch();

  const isGuestUser = Boolean(user?.is_guest);
  const hasActivePinned = Boolean(activePinnedDeposit?.public_key);

  const updateBoxContentStorage = useCallback((nextActivePinnedDeposit) => {
    try {
      const snap = getValid(KEY_BOX_CONTENT);
      if (!snap || snap.boxSlug !== boxSlug) return;

      setWithTTL(
        KEY_BOX_CONTENT,
        {
          ...snap,
          timestamp: Date.now(),
          activePinnedDeposit: nextActivePinnedDeposit || null,
        },
        TTL_MINUTES
      );
    } catch {}
  }, [boxSlug]);

  const hydratePinnedFromStorage = useCallback(() => {
    try {
      const snap = getValid(KEY_BOX_CONTENT);
      if (!snap || snap.boxSlug !== boxSlug) return false;

      setActivePinnedDeposit(snap.activePinnedDeposit || null);
      return true;
    } catch {
      return false;
    }
  }, [boxSlug]);

  const refreshPinnedSection = useCallback(async ({ preserveLoadedState = false } = {}) => {
    try {
      if (!preserveLoadedState) {
        setLoading(true);
      }

      const response = await fetch(
        `/box-management/pinned-song/?boxSlug=${encodeURIComponent(boxSlug)}`,
        {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Impossible de charger la chanson épinglée.");
      }

      const nextActivePinnedDeposit = data?.active_pinned_deposit || null;
      setActivePinnedDeposit(nextActivePinnedDeposit);
      setPriceSteps(Array.isArray(data?.price_steps) ? data.price_steps : []);
      updateBoxContentStorage(nextActivePinnedDeposit);
    } catch {
      setActivePinnedDeposit(null);
      setPriceSteps([]);
      updateBoxContentStorage(null);
    } finally {
      setLoading(false);
    }
  }, [boxSlug, updateBoxContentStorage]);

  useEffect(() => {
    const hydrated = hydratePinnedFromStorage();
    if (hydrated) {
      setLoading(false);
    }
    refreshPinnedSection({ preserveLoadedState: hydrated });
  }, [hydratePinnedFromStorage, refreshPinnedSection]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activePinnedDeposit?.pin_expires_at) return;
    if (getRemainingMs(activePinnedDeposit, nowTs) > 0) return;
    setActivePinnedDeposit(null);
    updateBoxContentStorage(null);
  }, [activePinnedDeposit, nowTs, updateBoxContentStorage]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    if (drawerStep !== "search") return undefined;
    const timer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 60);
    return () => clearTimeout(timer);
  }, [drawerOpen, drawerStep]);

  useEffect(() => {
    if (!priceSteps.length) {
      setSelectedStepIndex(0);
      return;
    }
    if (selectedStepIndex > priceSteps.length - 1) {
      setSelectedStepIndex(priceSteps.length - 1);
    }
  }, [priceSteps, selectedStepIndex]);

  const openSearchDrawer = useCallback(() => {
    setDrawerStep("search");
    setSelectedSong(null);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback((force = false) => {
    if (posting && !force) return;
    setDrawerOpen(false);
    setDrawerStep("search");
    setSelectedSong(null);
    resetSearch();
  }, [posting, resetSearch]);

  const handleSongSelected = useCallback((option) => {
    setSelectedSong(option || null);
    setDrawerStep("duration");
  }, []);

  const selectedPriceStep = priceSteps[selectedStepIndex] || null;
  const selectedDurationMinutes = Number(selectedPriceStep?.minutes || 0);
  const selectedPrice = Number(selectedPriceStep?.points || 0);
  const isSelectedPriceTooHigh = Boolean(
    selectedPriceStep && selectedPriceStep.is_affordable === false
  );

  const handleSubmitPinned = useCallback(async () => {
    if (posting || !selectedPriceStep || !selectedSong) return;

    try {
      setPosting(true);
      const response = await fetch("/box-management/pinned-song/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          boxSlug,
          duration_minutes: selectedDurationMinutes,
          option: selectedSong,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (typeof data?.points_balance === "number" && setUser) {
          setUser((prev) => ({ ...(prev || {}), points: data.points_balance }));
        }
        if (Array.isArray(data?.price_steps)) {
          setPriceSteps(data.price_steps);
        }
        if (data?.active_pinned_deposit) {
          setActivePinnedDeposit(data.active_pinned_deposit);
          updateBoxContentStorage(data.active_pinned_deposit);
        }
        window.alert(data?.detail || "Impossible d’épingler cette chanson.");
        return;
      }

      const nextActivePinnedDeposit = data?.active_pinned_deposit || null;
      setActivePinnedDeposit(nextActivePinnedDeposit);
      setPriceSteps(Array.isArray(data?.price_steps) ? data.price_steps : []);
      updateBoxContentStorage(nextActivePinnedDeposit);
      if (data?.current_user && setUser) {
        setUser(data.current_user);
      }
      closeDrawer(true);
    } catch {
      window.alert("Impossible d’épingler cette chanson.");
    } finally {
      setPosting(false);
    }
  }, [
    boxSlug,
    closeDrawer,
    posting,
    selectedDurationMinutes,
    selectedPriceStep,
    selectedSong,
    setUser,
    updateBoxContentStorage,
  ]);

  const remainingMs = getRemainingMs(activePinnedDeposit, nowTs);
  const totalDurationMs = Math.max(
    1,
    Number(activePinnedDeposit?.pin_duration_minutes || 0) * 60 * 1000
  );
  const progressValue = Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100));

  const progressFooter = hasActivePinned ? (
    <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
      <Box
        sx={{
          width: "100%",
          height: 8,
          borderRadius: "999px",
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        <Box
          sx={{
            width: `${progressValue}%`,
            height: "100%",
            bgcolor: "var(--mm-color-primary)",
            transition: "width 1s linear",
          }}
        />
      </Box>
      <Typography variant="body2" sx={{ mt: 1 }}>
        {formatRemainingTime(remainingMs)}
      </Typography>
    </Box>
  ) : null;

  const slotContent = useMemo(() => {
    if (loading) {
      return <Typography variant="body1">Chargement…</Typography>;
    }

    if (hasActivePinned) {
      return null;
    }

    if (isGuestUser) {
      return (
        <>
          <Typography variant="body1" sx={{ textAlign: "center", mb: 2 }}>
            Finalise ton compte pour pouvoir épingler une chanson.
          </Typography>
          <Button
            variant="contained"
            onClick={() =>
              navigate(
                `/register?merge_guest=1&prefill_username=${encodeURIComponent(user?.username || "")}`
              )
            }
          >
            Finalise ton compte
          </Button>
        </>
      );
    }

    return (
      <>
        <Typography variant="body1" sx={{ textAlign: "center", mb: 2 }}>
          Aucune chanson épinglée pour le moment
        </Typography>
        <Button variant="light" onClick={openSearchDrawer}>
          Épingler une chanson
        </Button>
      </>
    );
  }, [hasActivePinned, isGuestUser, loading, navigate, openSearchDrawer, user?.username]);

  return (
    <Box className="pinned_song_section">
      <Box className="icon_container info_box">
        <PushPinIcon sx={{transform: "rotate(45deg)",}}/>
      </Box>
      <Box className="pinned_song_container">
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            px: 2.5,
            pb: 1,
          }}
        >
          <Typography variant="h4">Épinglé ici</Typography>
        </Box>
        <Typography component="p" variant="body1" sx={{ mb: 3 }}>
           La chanson épinglée reste visible pour tous les passants ouvrant cette boîte pendant un temps donné.
        </Typography>
            
        {hasActivePinned ? (
          <Deposit
            dep={activePinnedDeposit}
            user={user}
            variant="list"
            showUser={true}
            showDate={true}
            fitContainer
            dateLabel={buildPinnedDateLabel(activePinnedDeposit)}
            userPrefix="par"
            footerSlot={progressFooter}
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
            {drawerStep === "search" ? (
              <>
                <Box sx={{ p: 5, pb: 2 }}>
                  <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
                    Choisis une chanson à épingler
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
                    onAction={handleSongSelected}
                    actionLabel="Choisir"
                    emptyContent={
                      searchValue.trim() ? (
                        <Box sx={{ px: 5, py: 3 }}>
                          <Typography variant="body1">Aucun résultat.</Typography>
                        </Box>
                      ) : (
                        <Box sx={{ px: 5, py: 3 }}>
                          
                        </Box>
                      )
                    }
                  />
                </Box>
              </>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <Box sx={{ 
                          p: 5,
                          pb: "100px",
                          /* flex-direction: column; */
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          height: "100%",
                        }}>
                  <Button
                    variant="text"
                    startIcon={<ArrowBackIcon />}
                    onClick={() => setDrawerStep("search")}
                    sx={{ px: 0, mb: 2 }}
                  >
                    Retour
                  </Button>
  
                  <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
                    Choisis une durée
                  </Typography>
                  <Typography component="p" variant="body1" sx={{ mb: 3 }}>
                    Choisis pendant combien de temps ta chanson sera épinglée à la boîte.
                  </Typography>
                      
  
                  <Box className="my_deposit deposit_card deposit_song" sx={{ width:"100%", boxSizing:"border-box" }}>
                    <Box className="img_container">
                      {selectedSong?.image_url_small || selectedSong?.image_url ? (
                        <Box
                          component="img"
                          src={selectedSong?.image_url_small || selectedSong?.image_url}
                          alt={selectedSong?.name || "Cover"}
                          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      ) : null}
                    </Box>
                    <Box className="texts">
                      <Typography className="titre" variant="h5" title={selectedSong?.name || ""}>
                        {selectedSong?.name || ""}
                      </Typography>
                      <Typography className="artist" variant="body1" title={selectedSong?.artist || ""}>
                        {selectedSong?.artist || ""}
                      </Typography>
                    </Box>
                  </Box>
  
                  <Box sx={{ 
                        display: "flex",
                        alignItems: "center",
                        gap: 0,
                        flex: "1",
                        minHeight: "0",
                        width: "100%",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "26px"
                          }}>
                    <Typography variant="h1">{formatDuration(selectedDurationMinutes)}</Typography>
                    <Box
                      key={`${selectedStepIndex}-${selectedPrice}`}
                      className="points_container points_container_big points_container_pop"
                      sx={{
                        margin: "12px auto",
                        display: "inline-flex",
                        gap: 1,
                        alignItems: "center",
                      }}
                    >
                      <Typography component="span" variant="body1">
                        {selectedPrice}
                      </Typography>
                      <MusicNote />
                    </Box>
                    {isSelectedPriceTooHigh ? (
                      <Typography variant="body1" sx={{ color: "var(--mm-color-error)" }}>
                        Tu n'as pas assez de points
                      </Typography>
                    ) : null}
                  </Box>
  
                  <Slider
                    value={selectedStepIndex}
                    min={0}
                    max={Math.max(priceSteps.length - 1, 0)}
                    step={1}
                    marks={priceSteps.map((_, index) => ({ value: index }))}
                    onChange={(_event, value) => {
                      const safeValue = Array.isArray(value) ? value[0] : value;
                      setSelectedStepIndex(Number(safeValue || 0));
                    }}
                    disabled={!priceSteps.length || posting}
                    valueLabelDisplay="off"
                    sx={{
                      color: isSelectedPriceTooHigh
                        ? "var(--mm-color-error)"
                        : "var(--mm-color-primary)",
                    }}
                  />
                </Box>
              </Box>
            )}
  
            <Button
              variant="contained"
              onClick={drawerStep === "duration" ? handleSubmitPinned : closeDrawer}
              className="bottom_fixed"
              disabled={posting || (drawerStep === "duration" && !selectedPriceStep)}
            >
              {drawerStep === "duration"
                ? posting
                  ? "Validation..."
                  : `Épingler pour ${selectedPrice} points`
                : "Fermer"}
            </Button>
          </Box>
        </Drawer>
      </Box>
    </Box>
  );
}
