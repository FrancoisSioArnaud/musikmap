
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SLOW_PROGRESS_TARGET = 78;
const SLOW_PROGRESS_DURATION_MS = 2800;
const FAST_PROGRESS_DURATION_MS = 700;
const MIN_VISUAL_DURATION_MS = 600;
const SUCCESS_HOLD_MS = 120;
const ERROR_HOLD_MS = 220;
const LOADING_SETTLE_MS = 100;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createRequestKey(itemId) {
  return `${itemId}::${Date.now()}::${Math.random().toString(36).slice(2, 8)}`;
}

export default function SongList({
  items,
  isLoading,
  depositFlowState = null,
  onSelectSong,
  onDepositVisualComplete,
  actionLabel = "Déposer",
  emptyContent = null,
}) {
  const [frozenItems, setFrozenItems] = useState(null);
  const [activeRequestKey, setActiveRequestKey] = useState(null);
  const [activeItemId, setActiveItemId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);
  const [showLoading, setShowLoading] = useState(Boolean(isLoading));

  const startedAtRef = useRef(null);
  const animationFrameRef = useRef(null);
  const settledStatusRef = useRef(null);

  const hasVisualFlow = Boolean(depositFlowState && typeof onDepositVisualComplete === "function");

  const resetVisualFlow = useCallback(() => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    startedAtRef.current = null;
    settledStatusRef.current = null;
    setFrozenItems(null);
    setActiveRequestKey(null);
    setActiveItemId(null);
    setProgress(0);
    setTransitionMs(0);
  }, []);

  useEffect(() => () => {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

  useEffect(() => {
    let timer = null;

    if (isLoading) {
      setShowLoading(true);
      return undefined;
    }

    timer = window.setTimeout(() => {
      setShowLoading(false);
    }, LOADING_SETTLE_MS);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [isLoading]);

  const displayItems = useMemo(() => {
    if (activeRequestKey && Array.isArray(frozenItems)) {
      return frozenItems;
    }
    return Array.isArray(items) ? items : [];
  }, [activeRequestKey, frozenItems, items]);

  const handleSelectSong = useCallback((option) => {
    if (!onSelectSong) {return;}

    if (!hasVisualFlow) {
      onSelectSong(option);
      return;
    }

    if (activeRequestKey) {
      return;
    }

    const itemId = option?.id ?? option?.provider_track_id ?? "__posting__";
    const requestKey = createRequestKey(itemId);

    setFrozenItems(Array.isArray(items) ? [...items] : []);
    setActiveRequestKey(requestKey);
    setActiveItemId(itemId);
    setProgress(0);
    setTransitionMs(0);
    startedAtRef.current = Date.now();
    settledStatusRef.current = null;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      setTransitionMs(SLOW_PROGRESS_DURATION_MS);
      setProgress(SLOW_PROGRESS_TARGET);
      animationFrameRef.current = null;
    });

    onSelectSong(option, requestKey);
  }, [activeRequestKey, hasVisualFlow, items, onSelectSong]);

  useEffect(() => {
    if (!hasVisualFlow || !activeRequestKey) {
      return undefined;
    }

    if (depositFlowState?.requestKey !== activeRequestKey) {
      return undefined;
    }

    if (settledStatusRef.current === depositFlowState?.status) {
      return undefined;
    }

    if (depositFlowState?.status === "success") {
      settledStatusRef.current = "success";
      let cancelled = false;

      const completeSuccess = async () => {
        const elapsed = Date.now() - (startedAtRef.current || Date.now());
        const remainingMinVisual = Math.max(0, MIN_VISUAL_DURATION_MS - elapsed);
        if (remainingMinVisual > 0) {
          await sleep(remainingMinVisual);
        }
        if (cancelled) {return;}

        setTransitionMs(FAST_PROGRESS_DURATION_MS);
        setProgress(100);
        await sleep(FAST_PROGRESS_DURATION_MS + SUCCESS_HOLD_MS);
        if (cancelled) {return;}

        onDepositVisualComplete?.(activeRequestKey);
      };

      completeSuccess();
      return () => {
        cancelled = true;
      };
    }

    if (depositFlowState?.status === "error") {
      settledStatusRef.current = "error";
      let cancelled = false;

      const completeError = async () => {
        const elapsed = Date.now() - (startedAtRef.current || Date.now());
        const remainingMinVisual = Math.max(0, MIN_VISUAL_DURATION_MS - elapsed);
        if (remainingMinVisual > 0) {
          await sleep(remainingMinVisual);
        }
        if (cancelled) {return;}

        await sleep(ERROR_HOLD_MS);
        if (cancelled) {return;}

        resetVisualFlow();
      };

      completeError();
      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [activeRequestKey, depositFlowState?.requestKey, depositFlowState?.status, hasVisualFlow, onDepositVisualComplete, resetVisualFlow]);

  if (showLoading) {
    return (
      <Box className="song_search_loading">
        <CircularProgress className="spinner" size={28} />
      </Box>
    );
  }

  if (!Array.isArray(displayItems) || displayItems.length === 0) {
    return emptyContent || null;
  }

  const isPosting = Boolean(activeRequestKey);

  return (
    <Box className="song_search_results" disablePadding>
      {displayItems.map((option) => {
        const id = option?.id ?? option?.provider_track_id ?? "__posting__";
        const isThisPosting = isPosting && activeItemId === id;

        return (
          <Box className="item" key={id}>
            <Box
              aria-hidden="true"
              className="item_fill"
              style={{
                width: isThisPosting ? `${progress}%` : "0%",
                transitionDuration: `${isThisPosting ? transitionMs : 0}ms`,
              }}
            />

            <Box className="row">
              <Box className="cover">
                {option?.image_url_small ? (
                  <Box
                    component="img"
                    className="image"
                    src={option.image_url_small}
                    alt={option.name || option.title || "Cover"}
                  />
                ) : null}
              </Box>

              <Box className="texts">
                <Typography
                  className="title"
                  component="h3"
                  variant="h6"
                  noWrap
                  title={option?.name || option?.title || ""}
                >
                  {option?.name || option?.title || ""}
                </Typography>
                <Typography
                  className="artist"
                  component="p"
                  variant="body2"
                  color="text.secondary"
                  noWrap
                  title={option?.artist || ""}
                >
                  {option?.artist || ""}
                </Typography>
              </Box>

              <Box className="action">
                <Button
                  className="action_button"
                  variant="contained"
                  size="small"
                  disabled={isPosting}
                  onClick={() => handleSelectSong(option)}
                >
                  {isThisPosting ? (
                    <Box className="action_content">
                      <CircularProgress className="spinner" size={16} />
                      {actionLabel}
                    </Box>
                  ) : (
                    actionLabel
                  )}
                </Button>
              </Box>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
