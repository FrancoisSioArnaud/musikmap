import React, { useContext, useEffect, useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import SearchPanel from "../Common/Search/SearchPanel";
import {
  resolveInitialSelectedProvider,
  NO_PERSONALIZED_RESULTS_PROVIDER,
} from "../Common/Search/SearchProviderSelector";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

function normalizeOptionToSong(option) {
  if (!option) return null;
  return {
    title: option.name || null,
    artist: option.artist || null,
    image_url: option.image_url || null,
  };
}

export default function LiveSearch() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user, setUser } = useContext(UserContext) || {};
  const { getBoxRuntime, saveDiscoverSnapshot } = useContext(FlowboxSessionContext);

  const runtime = getBoxRuntime(boxSlug);
  const incitationText = (runtime?.box?.searchIncitationText || "").trim();

  const [depositFlowState, setDepositFlowState] = useState({
    requestKey: null,
    status: "idle",
    errorMessage: null,
  });

  const searchInputRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const initialSelectedProvider = resolveInitialSelectedProvider(user);
    if (initialSelectedProvider !== NO_PERSONALIZED_RESULTS_PROVIDER) return undefined;

    const timer = setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);
    return () => clearTimeout(timer);
  }, [user?.id, user?.provider_connections]);

  const goOnboardingWithError = useCallback(
    (msg) => {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/`, {
        replace: true,
        state: { error: msg || "Erreur pendant le dépôt" },
      });
    },
    [navigate, boxSlug]
  );

  const handleDeposit = useCallback(
    async (option, requestKey) => {
      if (depositFlowState.status === "pending") return;

      setDepositFlowState({
        requestKey,
        status: "pending",
        errorMessage: null,
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

        const data = (await response.json().catch(() => null)) || {};
        if (!response.ok) {
          throw new Error(data?.detail || "Erreur pendant le dépôt");
        }

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

        saveDiscoverSnapshot(boxSlug, payload);

        if (!isMountedRef.current) return;

        setDepositFlowState({
          requestKey,
          status: "success",
          errorMessage: null,
        });
      } catch (error) {
        setDepositFlowState({
          requestKey,
          status: "error",
          errorMessage: error?.message || "Erreur pendant le dépôt",
        });
        goOnboardingWithError(error?.message || "Erreur pendant le dépôt");
      }
    },
    [boxSlug, depositFlowState.status, goOnboardingWithError, saveDiscoverSnapshot, setUser]
  );

  const handleDepositVisualComplete = useCallback(
    (requestKey) => {
      if (
        depositFlowState.requestKey !== requestKey ||
        depositFlowState.status !== "success"
      ) {
        return;
      }

      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, {
        replace: true,
      });
    },
    [boxSlug, depositFlowState.requestKey, depositFlowState.status, navigate]
  );

  return (
    <Box
      spacing={2}
      sx={{
        maxWidth: "100%",
        height: "calc(100vh - var(--mm-app-header-height, 56px))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ p: 4, pb: 2 }}>
        <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
          Choisis une chanson à partager
        </Typography>
      </Box>

      <SearchPanel
        inputRef={searchInputRef}
        onSelectSong={handleDeposit}
        onDepositVisualComplete={handleDepositVisualComplete}
        actionLabel="Déposer"
        depositFlowState={depositFlowState}
        searchIncitationText={incitationText}
        rootSx={{ flex: 1, minHeight: 0 }}
        searchBarWrapperSx={{ px: 4, pb: 2 }}
        contentSx={{ overflowX: "hidden", overflowY: "scroll", flex: 1 }}
      />
    </Box>
  );
}
