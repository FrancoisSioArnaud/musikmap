import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import SearchPanel from "../../Common/Search/SearchPanel";
import { getCookie } from "../../Security/TokensUtils";
import { UserContext } from "../../UserContext";
import {
  closeDrawerWithHistory,
  matchesDrawerSearch,
  openDrawerWithHistory,
} from "../../Utils/drawerHistory";
import { FlowboxSessionContext } from "../runtime/FlowboxSessionContext";

import MyDeposit from "./MyDeposit";

const LIVE_SEARCH_DRAWER_PARAM = "drawer";
const LIVE_SEARCH_DRAWER_VALUE = "live-search";
const DEFAULT_ERROR_MESSAGE = "Impossible de partager cette chanson pour le moment.";
const ALREADY_EXISTS_MESSAGE = "Tu as déjà partagé une chanson dans cette session.";
const HEADER_SELECTOR = ".MuiAppBar-root, header";
const POST_DEPOSIT_SCROLL_IDLE_MS = 160;
const POST_DEPOSIT_NO_SCROLL_FALLBACK_MS = 1000;

function getHeaderOffset() {
  if (typeof document === "undefined") {return 0;}
  const header = document.querySelector(HEADER_SELECTOR);
  return header?.getBoundingClientRect?.().height || 0;
}

function normalizeDepositResponse(data) {
  return {
    myDeposit: data?.my_deposit || null,
    successes: Array.isArray(data?.successes) ? data.successes : [],
    pointsBalance: typeof data?.points_balance === "number" ? data.points_balance : null,
    depositPointsEarned: typeof data?.deposit_points_earned === "number" ? data.deposit_points_earned : 0,
  };
}

function hasDepositResyncPayload(data) {
  return Boolean(data?.my_deposit);
}

function buildErrorMessage(data) {
  if (data?.code === "BOX_SESSION_DEPOSIT_ALREADY_EXISTS") {return ALREADY_EXISTS_MESSAGE;}
  return data?.detail || DEFAULT_ERROR_MESSAGE;
}

export default function LiveSearchSection({
  boxSlug,
  myDeposit,
  successes = [],
  pointsBalance = null,
  depositPointsEarned = 0,
  onDepositCreated,
  onOpenAchievements,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext) || {};
  const { clearBoxSession } = useContext(FlowboxSessionContext) || {};

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [depositFlowState, setDepositFlowState] = useState({
    requestKey: null,
    status: "idle",
    errorMessage: null,
  });
  const [isFixed, setIsFixed] = useState(false);
  const [liveSearchHeight, setLiveSearchHeight] = useState(0);
  const [headerOffset, setHeaderOffset] = useState(0);
  const [postDepositMountStep, setPostDepositMountStep] = useState("idle");
  const placeholderRef = useRef(null);
  const liveSearchRef = useRef(null);
  const searchInputRef = useRef(null);
  const isPostingRef = useRef(false);
  const pendingDepositResultRef = useRef(null);
  const postDepositAnchorRef = useRef(null);
  const pendingDepositMountRef = useRef(null);
  const pendingScrollBeforeMountRef = useRef(false);

  const hasDeposit = Boolean(myDeposit);
  const isPreDeposit = !hasDeposit && depositFlowState.status !== "success";

  const measureLiveSearchHeight = useCallback(() => {
    const height = liveSearchRef.current?.getBoundingClientRect?.().height || 0;
    setLiveSearchHeight((previousHeight) => (previousHeight === height ? previousHeight : height));
  }, []);

  const updateFixedState = useCallback(() => {
    const nextHeaderOffset = getHeaderOffset();
    setHeaderOffset((previousOffset) => (previousOffset === nextHeaderOffset ? previousOffset : nextHeaderOffset));

    if (!isPreDeposit || !placeholderRef.current) {
      setIsFixed((previousFixed) => (previousFixed ? false : previousFixed));
      return;
    }

    const placeholderTop = placeholderRef.current.getBoundingClientRect().top;
    const shouldBeFixed = placeholderTop <= nextHeaderOffset;
    setIsFixed((previousFixed) => (previousFixed === shouldBeFixed ? previousFixed : shouldBeFixed));
  }, [isPreDeposit]);

  useEffect(() => {
    measureLiveSearchHeight();

    const liveSearchElement = liveSearchRef.current;
    if (!liveSearchElement) {return undefined;}
    if (typeof ResizeObserver === "undefined") {return undefined;}

    const observer = new ResizeObserver(measureLiveSearchHeight);
    observer.observe(liveSearchElement);

    return () => {
      observer.disconnect();
    };
  }, [isPreDeposit, measureLiveSearchHeight]);

  useEffect(() => {
    let animationFrameId = null;

    const scheduleUpdate = () => {
      if (animationFrameId !== null) {return;}
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measureLiveSearchHeight();
        updateFixedState();
      });
    };

    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [measureLiveSearchHeight, updateFixedState]);

  useEffect(() => {
    if (isPreDeposit) {return;}
    setIsFixed((previousFixed) => (previousFixed ? false : previousFixed));
  }, [isPreDeposit]);

  useEffect(() => {
    const shouldOpenDrawer = !hasDeposit && matchesDrawerSearch(
      location,
      LIVE_SEARCH_DRAWER_PARAM,
      LIVE_SEARCH_DRAWER_VALUE
    );
    setDrawerOpen((prev) => (prev === shouldOpenDrawer ? prev : shouldOpenDrawer));
  }, [hasDeposit, location]);

  const closeDrawer = useCallback((options = {}) => {
    const closedByHistory = closeDrawerWithHistory({
      navigate,
      location,
      param: LIVE_SEARCH_DRAWER_PARAM,
      value: LIVE_SEARCH_DRAWER_VALUE,
      replace: Boolean(options?.replace),
    });

    if (!closedByHistory) {
      setDrawerOpen(false);
    }
  }, [location, navigate]);

  const applyPendingDepositMount = useCallback(() => {
    const normalized = pendingDepositMountRef.current;
    if (!normalized) {return;}

    onDepositCreated?.(normalized);

    if (typeof normalized.pointsBalance === "number" && setUser) {
      setUser((prev) => ({ ...(prev || {}), points: normalized.pointsBalance }));
    }

    pendingDepositMountRef.current = null;
    pendingScrollBeforeMountRef.current = false;
    setPostDepositMountStep("idle");
  }, [onDepositCreated, setUser]);

  useEffect(() => {
    if (drawerOpen) {return undefined;}
    if (postDepositMountStep !== "scrolling-before-mount") {return undefined;}
    if (!pendingScrollBeforeMountRef.current) {return undefined;}
    if (!pendingDepositMountRef.current) {return undefined;}

    let scrollIdleTimeoutId = null;
    let noScrollFallbackTimeoutId = null;
    let hasAppliedDeposit = false;

    const clearPendingTimers = () => {
      if (scrollIdleTimeoutId !== null) {
        window.clearTimeout(scrollIdleTimeoutId);
        scrollIdleTimeoutId = null;
      }
      if (noScrollFallbackTimeoutId !== null) {
        window.clearTimeout(noScrollFallbackTimeoutId);
        noScrollFallbackTimeoutId = null;
      }
    };

    const removeScrollListeners = () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scrollend", handleScrollEnd);
      document.removeEventListener("scrollend", handleScrollEnd);
    };

    const finishScrollThenMount = () => {
      if (hasAppliedDeposit) {return;}

      hasAppliedDeposit = true;
      removeScrollListeners();
      clearPendingTimers();
      applyPendingDepositMount();
    };

    const scheduleScrollIdleMount = () => {
      if (scrollIdleTimeoutId !== null) {
        window.clearTimeout(scrollIdleTimeoutId);
      }
      scrollIdleTimeoutId = window.setTimeout(finishScrollThenMount, POST_DEPOSIT_SCROLL_IDLE_MS);
    };

    function handleScroll() {
      if (noScrollFallbackTimeoutId !== null) {
        window.clearTimeout(noScrollFallbackTimeoutId);
        noScrollFallbackTimeoutId = null;
      }
      scheduleScrollIdleMount();
    }

    function handleScrollEnd() {
      finishScrollThenMount();
    }

    const frameId = window.requestAnimationFrame(() => {
      if (!postDepositAnchorRef.current) {return;}

      window.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("scrollend", handleScrollEnd);
      document.addEventListener("scrollend", handleScrollEnd);

      postDepositAnchorRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      noScrollFallbackTimeoutId = window.setTimeout(
        finishScrollThenMount,
        POST_DEPOSIT_NO_SCROLL_FALLBACK_MS
      );
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      removeScrollListeners();
      clearPendingTimers();
    };
  }, [applyPendingDepositMount, drawerOpen, postDepositMountStep]);

  useEffect(() => {
    if (!hasDeposit) {return;}
    if (!matchesDrawerSearch(location, LIVE_SEARCH_DRAWER_PARAM, LIVE_SEARCH_DRAWER_VALUE)) {return;}
    closeDrawer({ replace: true });
  }, [closeDrawer, hasDeposit, location]);

  const openDrawer = useCallback(() => {
    if (hasDeposit) {return;}
    pendingDepositResultRef.current = null;
    setErrorMessage("");
    openDrawerWithHistory({
      navigate,
      location,
      param: LIVE_SEARCH_DRAWER_PARAM,
      value: LIVE_SEARCH_DRAWER_VALUE,
    });
  }, [hasDeposit, location, navigate]);

  const handleDepositVisualComplete = useCallback((requestKey = null) => {
    const pendingDepositResult = pendingDepositResultRef.current;
    if (!pendingDepositResult) {return;}
    if (pendingDepositResult.requestKey !== requestKey) {return;}

    const normalized = pendingDepositResult.normalized;

    pendingDepositMountRef.current = normalized;
    pendingScrollBeforeMountRef.current = true;
    pendingDepositResultRef.current = null;
    isPostingRef.current = false;
    setPostDepositMountStep("scrolling-before-mount");
    closeDrawer();
  }, [closeDrawer]);

  const handleDepositError = useCallback((data, response) => {
    if (response?.status === 403 && data?.code === "BOX_SESSION_REQUIRED") {
      clearBoxSession?.(boxSlug, { markExpired: true });
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/closed`, { replace: true });
      return true;
    }

    setErrorMessage(buildErrorMessage(data));
    return false;
  }, [boxSlug, clearBoxSession, navigate]);

  const handleSongSelected = useCallback(async (option, requestKey = null) => {
    if (hasDeposit || isPostingRef.current) {return;}
    isPostingRef.current = true;
    setErrorMessage("");
    setDepositFlowState({ requestKey, status: "pending", errorMessage: null });

    try {
      const response = await fetch(
        `/box-management/box-deposit/?boxSlug=${encodeURIComponent(boxSlug)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": getCookie("csrftoken"),
            Accept: "application/json",
          },
          body: JSON.stringify({ option: { ...option } }),
        }
      );
      const data = (await response.json().catch(() => null)) || {};

      if (!response.ok) {
        if (
          response.status === 409 &&
          data?.code === "BOX_SESSION_DEPOSIT_ALREADY_EXISTS" &&
          hasDepositResyncPayload(data)
        ) {
          const normalized = normalizeDepositResponse(data);
          pendingDepositResultRef.current = { requestKey, normalized };
          setDepositFlowState({ requestKey, status: "success", errorMessage: null });
          return;
        }

        const handled = handleDepositError(data, response);
        isPostingRef.current = false;
        if (!handled) {
          setDepositFlowState({
            requestKey,
            status: "error",
            errorMessage: buildErrorMessage(data),
          });
        }
        return;
      }

      const normalized = normalizeDepositResponse(data);
      pendingDepositResultRef.current = { requestKey, normalized };
      setDepositFlowState({ requestKey, status: "success", errorMessage: null });
    } catch (error) {
      const message = error?.message || DEFAULT_ERROR_MESSAGE;
      setErrorMessage(message);
      setDepositFlowState({ requestKey, status: "error", errorMessage: message });
      isPostingRef.current = false;
    }
  }, [boxSlug, handleDepositError, hasDeposit]);

  const placeholderSx = isFixed && liveSearchHeight > 0
    ? { height: `${liveSearchHeight}px` }
    : undefined;
  const liveSearchClassName = `liveSearch${isFixed ? " fixed" : ""}`;
  const liveSearchStyle = isFixed ? { top: `${headerOffset}px` } : undefined;

  return (
    <Box
      ref={postDepositAnchorRef}
      className={hasDeposit ? "myDepositScrollTarget" : "liveSearchScrollTarget"}
      data-testid="post-deposit-scroll-target"
    >
      {hasDeposit ? (
        <Box data-testid="my-deposit-scroll-target">
          <MyDeposit
            deposit={myDeposit}
            successes={successes}
            pointsBalance={pointsBalance}
            depositPointsEarned={depositPointsEarned}
            onOpenAchievements={onOpenAchievements}
          />
        </Box>
      ) : (
        <Box ref={placeholderRef} sx={placeholderSx} className="liveSearchPlaceholder">
          <Box
            ref={liveSearchRef}
            className={liveSearchClassName}
            style={liveSearchStyle}
          >
            <Typography component="h5" variant="h5">
              Ajoute une chanson à la boîte pour gagner des points et révéler plus de chansons
            </Typography>

            {errorMessage ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorMessage}
              </Alert>
            ) : null}

            <Button variant="contained" onClick={openDrawer}>
              Partager une chanson
            </Button>

            <Drawer
              anchor="right"
              open={drawerOpen}
              onClose={() => closeDrawer()}
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
                    Choisis une chanson à partager
                  </Typography>
                </Box>

                {errorMessage ? (
                  <Alert severity="error" sx={{ mx: 5, mb: 2 }}>
                    {errorMessage}
                  </Alert>
                ) : null}

                {drawerOpen ? (
                  <SearchPanel
                    inputRef={searchInputRef}
                    onSelectSong={handleSongSelected}
                    actionLabel="Partager"
                    depositFlowState={depositFlowState}
                    onDepositVisualComplete={handleDepositVisualComplete}
                    rootSx={{ flex: 1, minHeight: 0 }}
                    searchBarWrapperSx={{ px: 5, pb: 2 }}
                    contentSx={{ overflowX: "hidden", overflowY: "scroll", flex: 1, pb: "96px" }}
                  />
                ) : null}
              </Box>
            </Drawer>
          </Box>
        </Box>
      )}
    </Box>
  );
}
