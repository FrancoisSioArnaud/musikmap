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

function getHeaderBottomOffset() {
  const header = document.querySelector(".MuiAppBar-root, header");
  if (header) {
    const headerRect = header.getBoundingClientRect();
    if (Number.isFinite(headerRect.bottom)) {return Math.max(0, headerRect.bottom);}
  }

  const cssHeaderHeight = getComputedStyle(document.documentElement)
    .getPropertyValue("--mm-app-header-height");
  const parsedHeaderHeight = Number.parseFloat(cssHeaderHeight);
  return Number.isFinite(parsedHeaderHeight) ? parsedHeaderHeight : 0;
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
  const searchInputRef = useRef(null);
  const sectionAnchorRef = useRef(null);
  const liveSearchSlotRef = useRef(null);
  const liveSearchCardRef = useRef(null);
  const isPostingRef = useRef(false);
  const pendingDepositResultRef = useRef(null);
  const pendingScrollToSectionRef = useRef(false);
  const [isLiveSearchFixed, setIsLiveSearchFixed] = useState(false);
  const [liveSearchHeight, setLiveSearchHeight] = useState(0);

  const hasDeposit = Boolean(myDeposit);

  const updateLiveSearchFixedState = useCallback(() => {
    if (hasDeposit || !liveSearchSlotRef.current || !liveSearchCardRef.current) {
      setIsLiveSearchFixed(false);
      setLiveSearchHeight(0);
      return;
    }

    const slotRect = liveSearchSlotRef.current.getBoundingClientRect();
    const cardRect = liveSearchCardRef.current.getBoundingClientRect();
    const headerBottom = getHeaderBottomOffset();

    setLiveSearchHeight((currentHeight) => {
      const nextHeight = Math.ceil(cardRect.height || liveSearchCardRef.current?.offsetHeight || 0);
      return currentHeight === nextHeight ? currentHeight : nextHeight;
    });
    const nextFixed = slotRect.top <= headerBottom;
    setIsLiveSearchFixed((currentFixed) => currentFixed === nextFixed ? currentFixed : nextFixed);
  }, [hasDeposit]);

  useEffect(() => {
    if (hasDeposit) {
      setIsLiveSearchFixed(false);
      setLiveSearchHeight(0);
      return undefined;
    }

    updateLiveSearchFixedState();
    window.addEventListener("scroll", updateLiveSearchFixedState, { passive: true });
    window.addEventListener("resize", updateLiveSearchFixedState);

    return () => {
      window.removeEventListener("scroll", updateLiveSearchFixedState);
      window.removeEventListener("resize", updateLiveSearchFixedState);
    };
  }, [hasDeposit, updateLiveSearchFixedState]);

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
    onDepositCreated?.(normalized);

    if (typeof normalized.pointsBalance === "number" && setUser) {
      setUser((prev) => ({ ...(prev || {}), points: normalized.pointsBalance }));
    }

    pendingDepositResultRef.current = null;
    pendingScrollToSectionRef.current = true;
    isPostingRef.current = false;
    closeDrawer();
  }, [closeDrawer, onDepositCreated, setUser]);

  useEffect(() => {
    if (drawerOpen || !pendingScrollToSectionRef.current) {return;}

    pendingScrollToSectionRef.current = false;
    sectionAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [drawerOpen]);

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

  return (
    <Box ref={sectionAnchorRef} className="liveSearch_section_anchor">
      {hasDeposit ? (
        <MyDeposit
          deposit={myDeposit}
          successes={successes}
          pointsBalance={pointsBalance}
          depositPointsEarned={depositPointsEarned}
          onOpenAchievements={onOpenAchievements}
        />
      ) : (
        <Box
          ref={liveSearchSlotRef}
          className="liveSearch_slot"
          style={isLiveSearchFixed && liveSearchHeight > 0 ? { minHeight: liveSearchHeight } : undefined}
        >
          <Box
            ref={liveSearchCardRef}
            className={`liveSearch${isLiveSearchFixed ? " fixed" : ""}`}
          >
            <Typography component="h3" variant="h5">
              Ajoute une chanson à la boîte et gagne pleins de points
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
