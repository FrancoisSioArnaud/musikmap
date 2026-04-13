import React, { useContext, useEffect, useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { setWithTTL } from "../Utils/mmStorage";
import SongSearchResultsList from "../Common/SongSearchResultsList";
import SearchPersonalizationSelector from "../Common/SearchPersonalizationSelector";
import useSongSearch from "../Common/useSongSearch";

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 120;

const SLOW_PROGRESS_TARGET = 78;
const SLOW_PROGRESS_DURATION_MS = 2800;
const FAST_PROGRESS_DURATION_MS = 700;
const MIN_VISUAL_DURATION_MS = 600;
const SUCCESS_HOLD_MS = 120;

function normalizeOptionToSong(option) {
  if (!option) return null;
  return {
    title: option.name || null,
    artist: option.artist || null,
    image_url: option.image_url || null,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export default function LiveSearch() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user, setUser } = useContext(UserContext) || {};

  const [incitationText, setIncitationText] = useState("");
  const [incitationLoading, setIncitationLoading] = useState(true);

  const [posting, setPosting] = useState(false);
  const [postingId, setPostingId] = useState(null);
  const [postingProgress, setPostingProgress] = useState(0);
  const [postingTransitionMs, setPostingTransitionMs] = useState(0);

  const searchInputRef = useRef(null);
  const isMountedRef = useRef(true);

  const {
    searchValue,
    setSearchValue,
    results,
    recentPlays,
    isSearching,
    isLoadingRecentPlays,
    selectedStreamingService,
    setSelectedStreamingService,
    connectedPersonalizedProviderCodes,
    connectProvider,
    canShowRecentPlays,
  } = useSongSearch();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const hasLastPlatform = Boolean(String(user?.last_platform || "").trim());
    if (hasLastPlatform) return undefined;

    const timer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [user?.last_platform]);

  useEffect(() => {
    setIncitationLoading(true);

    try {
      const raw = localStorage.getItem("mm_current_box");
      const storedBox = raw ? JSON.parse(raw) : null;

      if (storedBox?.box_slug === boxSlug) {
        setIncitationText((storedBox?.search_incitation_text || "").trim());
      } else {
        setIncitationText("");
      }
    } catch {
      setIncitationText("");
    } finally {
      setIncitationLoading(false);
    }
  }, [boxSlug]);

  const goOnboardingWithError = useCallback(
    (msg) => {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/`, {
        replace: true,
        state: { error: msg || "Erreur pendant le dépôt" },
      });
    },
    [navigate, boxSlug]
  );

  const resetPostingState = useCallback(() => {
    if (!isMountedRef.current) return;
    setPosting(false);
    setPostingId(null);
    setPostingProgress(0);
    setPostingTransitionMs(0);
  }, []);

  const handleDeposit = useCallback(
    async (option) => {
      if (posting) return;

      const id = option?.id ?? "__posting__";
      const startedAt = Date.now();

      setPosting(true);
      setPostingId(id);
      setPostingProgress(0);
      setPostingTransitionMs(0);

      requestAnimationFrame(() => {
        if (!isMountedRef.current) return;
        setPostingTransitionMs(SLOW_PROGRESS_DURATION_MS);
        setPostingProgress(SLOW_PROGRESS_TARGET);
      });

      try {
        const csrftoken = getCookie("csrftoken");
        const body = {
          option: {
            ...option,
            image_url: option?.image_url || null,
            image_url_small: option?.image_url_small || null,
          },
          boxSlug,
        };

        const response = await fetch(`/box-management/get-box/`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error("Erreur pendant le dépôt");
        }

        const data = (await response.json().catch(() => null)) || {};
        const {
          successes = [],
          points_balance = null,
          older_deposits = [],
          main = null,
          active_pinned_deposit = null,
        } = data;

        if (setUser) {
          if (data?.current_user) {
            setUser(data.current_user);
          } else if (typeof points_balance === "number") {
            setUser((prev) => ({ ...(prev || {}), points: points_balance }));
          }
        }

        const isoNow = new Date().toISOString();
        const myDeposit = {
          song: normalizeOptionToSong(option),
          deposited_at: isoNow,
        };

        const payload = {
          boxSlug,
          timestamp: Date.now(),
          main: main || null,
          olderDeposits: Array.isArray(older_deposits) ? older_deposits : [],
          successes: Array.isArray(successes) ? successes : [],
          activePinnedDeposit: active_pinned_deposit || null,
          myDeposit,
        };

        setWithTTL(KEY_BOX_CONTENT, payload, TTL_MINUTES);

        const elapsed = Date.now() - startedAt;
        const remainingMinVisual = Math.max(0, MIN_VISUAL_DURATION_MS - elapsed);
        if (remainingMinVisual > 0) {
          await sleep(remainingMinVisual);
        }

        if (!isMountedRef.current) return;

        setPostingTransitionMs(FAST_PROGRESS_DURATION_MS);
        setPostingProgress(100);

        await sleep(FAST_PROGRESS_DURATION_MS + SUCCESS_HOLD_MS);

        if (!isMountedRef.current) return;

        navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, {
          replace: true,
        });
      } catch {
        resetPostingState();
        goOnboardingWithError("Erreur pendant le dépôt");
      }
    },
    [posting, boxSlug, navigate, setUser, goOnboardingWithError, resetPostingState]
  );

  const emptyContent = searchValue.trim() ? null : (
    <Stack spacing={2} sx={{ pb: 3 }}>
      {incitationLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}><Typography variant="body2">Chargement…</Typography></Box>
      ) : incitationText ? (
        <Box
          sx={{
            margin: "0px 20px",
            backgroundColor: "var(--mm-color-secondary-light)",
            padding: "16px 20px",
            borderRadius: "var(--mm-radius-lg)",
            display: "flex",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <CampaignRoundedIcon />
          <Typography variant="subtitle1">{incitationText}</Typography>
        </Box>
      ) : null}

      {canShowRecentPlays ? (
        <>
          <Box sx={{ padding: "16px 20px -4px 20px", mt: "12px", backgroundColor: "var(--mm-color-primary-light)" }}>
            <Typography sx={{ opacity:"var(--mm-opacity-light-text)" }} component="h3" variant="h5">Écoutés récemment</Typography>
          </Box>
          <SongSearchResultsList
            results={recentPlays}
            isSearching={isLoadingRecentPlays}
            posting={posting}
            postingId={postingId}
            postingProgress={postingProgress}
            postingTransitionMs={postingTransitionMs}
            onAction={handleDeposit}
            actionLabel="Déposer"
            emptyContent={
              <Box sx={{ px: 5, py: 1 }}>
                <Typography variant="body2" color="text.secondary">Aucune écoute récente disponible.</Typography>
              </Box>
            }
          />
        </>
      ) : null}
    </Stack>
  );

  return (
    <Stack spacing={2} sx={{ maxWidth: "100%", height: "calc(100vh - 58px)" }}>
      <Box sx={{ p: 4, pb: 2 }}>
        <Stack spacing={2}>
          <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
            Choisis une chanson à partager
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
              endAdornment: (
                <SearchPersonalizationSelector
                  selectedProviderCode={selectedStreamingService}
                  connectedProviderCodes={connectedPersonalizedProviderCodes}
                  onSelectProvider={setSelectedStreamingService}
                  onConnectProvider={connectProvider}
                />
              ),
            }}
            sx={{
              borderRadius: "var(--mm-radius-round)",
              "& .MuiInputBase-input": { fontSize: 16 },
            }}
          />
        </Stack>
      </Box>

      <Box sx={{ overflowX: "hidden", overflowY: "scroll", flex: 1 }}>
        <SongSearchResultsList
          results={results}
          isSearching={isSearching}
          posting={posting}
          postingId={postingId}
          postingProgress={postingProgress}
          postingTransitionMs={postingTransitionMs}
          onAction={handleDeposit}
          actionLabel="Déposer"
          emptyContent={emptyContent}
        />
      </Box>
    </Stack>
  );
}
