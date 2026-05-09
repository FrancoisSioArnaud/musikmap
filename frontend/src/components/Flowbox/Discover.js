// frontend/src/components/Flowbox/Discover.js
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import React, { useEffect, useState, useContext, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import Deposit from "../Common/Deposit";
import { UserContext } from "../UserContext";
import {
  closeDrawerWithHistory,
  matchesDrawerSearch,
  openDrawerWithHistory,
} from "../Utils/drawerHistory";

import AchievementsPanel from "./AchievementsPanel";
import DiscoverTimeline from "./discover/DiscoverTimeline";
import LiveSearchSection from "./discover/LiveSearchSection";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

const ACHIEVEMENTS_DRAWER_PARAM = "drawer";
const ACHIEVEMENTS_DRAWER_VALUE = "achievements";

function normalizeDiscoverPayload(payload, fallbackSlug) {
  const source = payload || {};
  return {
    boxSlug: source.boxSlug || source.box_slug || fallbackSlug || null,
    loadedAt: source.loadedAt || source.loaded_at || new Date().toISOString(),
    main: source.main || null,
    olderDeposits: Array.isArray(source.olderDeposits || source.older_deposits)
      ? (source.olderDeposits || source.older_deposits)
      : [],
    olderDepositsNextCursor: source.olderDepositsNextCursor ?? source.older_deposits_next_cursor ?? null,
    olderDepositsHasMore: Boolean(source.olderDepositsHasMore ?? source.older_deposits_has_more ?? false),
    activePinnedDeposit: source.activePinnedDeposit || source.active_pinned_deposit || null,
    myDeposit: source.myDeposit || source.my_deposit || null,
    successes: Array.isArray(source.successes) ? source.successes : [],
    pointsBalance: typeof (source.pointsBalance ?? source.points_balance) === "number"
      ? (source.pointsBalance ?? source.points_balance)
      : null,
    depositPointsEarned: typeof (source.depositPointsEarned ?? source.deposit_points_earned) === "number"
      ? (source.depositPointsEarned ?? source.deposit_points_earned)
      : 0,
  };
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeDiscoverPatch(patch, fallbackSlug) {
  const source = patch || {};
  const normalized = {
    boxSlug: source.boxSlug || source.box_slug || fallbackSlug || null,
  };

  if (hasOwn(source, "myDeposit") || hasOwn(source, "my_deposit")) {
    normalized.myDeposit = source.myDeposit ?? source.my_deposit ?? null;
  }

  if (hasOwn(source, "successes")) {
    normalized.successes = Array.isArray(source.successes) ? source.successes : [];
  }

  if (hasOwn(source, "pointsBalance") || hasOwn(source, "points_balance")) {
    const pointsBalance = source.pointsBalance ?? source.points_balance;
    normalized.pointsBalance = typeof pointsBalance === "number" ? pointsBalance : null;
  }

  if (hasOwn(source, "depositPointsEarned") || hasOwn(source, "deposit_points_earned")) {
    const depositPointsEarned = source.depositPointsEarned ?? source.deposit_points_earned;
    normalized.depositPointsEarned = typeof depositPointsEarned === "number" ? depositPointsEarned : 0;
  }

  return normalized;
}

export default function Discover() {
  const location = useLocation();
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};
  const {
    getDiscoverSnapshot,
    saveDiscoverSnapshot,
    patchDiscoverSnapshot,
    clearBoxSession,
  } = useContext(FlowboxSessionContext);

  const [boxContent, setBoxContent] = useState(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState("");
  const [openAchievements, setOpenAchievements] = useState(false);

  useEffect(() => {
    const snap = getDiscoverSnapshot(boxSlug);

    if (snap && snap.boxSlug === boxSlug) {
      setBoxContent(normalizeDiscoverPayload(snap, boxSlug));
      setContentError("");
      setContentLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setContentLoading(true);
        setContentError("");

        const response = await fetch(
          `/box-management/box-content/?boxSlug=${encodeURIComponent(boxSlug)}`,
          {
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 403 && data?.code === "BOX_SESSION_REQUIRED") {
            clearBoxSession(boxSlug, { markExpired: true });
            navigate(`/flowbox/${encodeURIComponent(boxSlug)}/closed`, { replace: true });
            return;
          }
          throw new Error(data?.detail || "Impossible de charger la découverte.");
        }
        if (cancelled) {return;}

        const snapshot = normalizeDiscoverPayload(data, boxSlug);
        saveDiscoverSnapshot(boxSlug, snapshot);
        setBoxContent(snapshot);
      } catch (error) {
        if (!cancelled) {
          setContentError(error?.message || "Impossible de charger la découverte.");
          setBoxContent(null);
        }
      } finally {
        if (!cancelled) {
          setContentLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boxSlug, clearBoxSession, getDiscoverSnapshot, navigate, saveDiscoverSnapshot]);

  useEffect(() => {
    const shouldOpenAchievements = matchesDrawerSearch(
      location,
      ACHIEVEMENTS_DRAWER_PARAM,
      ACHIEVEMENTS_DRAWER_VALUE
    );

    setOpenAchievements((prev) =>
      prev === shouldOpenAchievements ? prev : shouldOpenAchievements
    );
  }, [location]);

  const myDeposit = boxContent?.myDeposit || null;

  const mainDep = boxContent?.main || null;
  const successes = Array.isArray(boxContent?.successes)
    ? boxContent.successes
    : [];
  const handleOpenAchievements = useCallback(() => {
    openDrawerWithHistory({
      navigate,
      location,
      param: ACHIEVEMENTS_DRAWER_PARAM,
      value: ACHIEVEMENTS_DRAWER_VALUE,
    });
  }, [location, navigate]);

  const handleCloseAchievements = useCallback(() => {
    if (
      !closeDrawerWithHistory({
        navigate,
        location,
        param: ACHIEVEMENTS_DRAWER_PARAM,
        value: ACHIEVEMENTS_DRAWER_VALUE,
      })
    ) {
      setOpenAchievements(false);
    }
  }, [location, navigate]);

  const handleDepositCreated = useCallback((patch) => {
    const normalizedPatch = normalizeDiscoverPatch(patch, boxSlug);
    patchDiscoverSnapshot?.(boxSlug, normalizedPatch);
    setBoxContent((current) => ({
      ...(current || normalizeDiscoverPayload({}, boxSlug)),
      ...normalizedPatch,
      boxSlug,
    }));
  }, [boxSlug, patchDiscoverSnapshot]);

  if (contentLoading) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center", p: 3 }}>
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress />
          <Typography sx={{ mt: 2 }}>Chargement de la découverte…</Typography>
        </Box>
      </Box>
    );
  }

  if (contentError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{contentError}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Drawer
        anchor="right"
        open={openAchievements}
        onClose={handleCloseAchievements}
        PaperProps={{
          sx: {
            width: "100vw",
            maxWidth: "100vw",
            height: "100vh",
            overflow: "hidden",
          },
        }}
      >
        <Box sx={{ height: "100%", overflowY: "auto" }}>
          <AchievementsPanel successes={successes} />

          <Button
            variant="contained"
            onClick={handleCloseAchievements}
            className="bottom_fixed"
          >
            Fermer
          </Button>
        </Box>
      </Drawer>

      <Box className="intro">
        <Typography component="h2" variant="h1">
          Les chansons de cette boîte
        </Typography>
      </Box>

      {mainDep ? (
        <Box sx={{ margin: "0 20px" }}>
          <Deposit dep={mainDep} user={user} showPlay={true} showUser={true} />
        </Box>
      ) : (
        <Box sx={{ p: 3 }}>
          <Alert severity="info">
            Aucune chanson à découvrir pour le moment. Reviens bientôt : les prochaines
            chansons déposées apparaîtront ici.
          </Alert>
        </Box>
      )}

      <LiveSearchSection
        boxSlug={boxSlug}
        myDeposit={myDeposit}
        successes={successes}
        pointsBalance={boxContent?.pointsBalance ?? null}
        depositPointsEarned={boxContent?.depositPointsEarned ?? 0}
        onDepositCreated={handleDepositCreated}
        onOpenAchievements={handleOpenAchievements}
      />

      <DiscoverTimeline
        boxSlug={boxSlug}
        initialDeposits={boxContent?.olderDeposits}
        initialNextCursor={boxContent?.olderDepositsNextCursor}
        initialHasMore={boxContent?.olderDepositsHasMore}
        activePinnedDeposit={boxContent?.activePinnedDeposit}
        user={user}
      />
    </Box>
  );
}
