// frontend/src/components/Flowbox/Discover.js
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import React, { useEffect, useState, useContext, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";


import ArticleCard from "../Common/Article/ArticleCard";
import ArticleDrawer from "../Common/Article/ArticleDrawer";
import Deposit from "../Common/Deposit";
import { UserContext } from "../UserContext";
import {
  closeDrawerWithHistory,
  getDrawerParamValue,
  matchesDrawerSearch,
  openDrawerWithHistory,
} from "../Utils/drawerHistory";

import AchievementsPanel from "./AchievementsPanel";
import LiveSearchSection from "./discover/LiveSearchSection";
import PinnedSongSection from "./PinnedSongSection";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

const MAX_VISIBLE_ARTICLES = 5;
const ACHIEVEMENTS_DRAWER_PARAM = "drawer";
const ACHIEVEMENTS_DRAWER_VALUE = "achievements";
const ARTICLE_DRAWER_PARAM = "article";

function normalizeDiscoverPayload(payload, fallbackSlug) {
  const source = payload || {};
  return {
    boxSlug: source.boxSlug || source.box_slug || fallbackSlug || null,
    loadedAt: source.loadedAt || source.loaded_at || new Date().toISOString(),
    main: source.main || null,
    olderDeposits: Array.isArray(source.olderDeposits || source.older_deposits)
      ? (source.olderDeposits || source.older_deposits)
      : [],
    activePinnedDeposit: source.activePinnedDeposit || source.active_pinned_deposit || null,
    myDeposit: source.myDeposit || source.my_deposit || null,
    successes: Array.isArray(source.successes) ? source.successes : [],
    pointsBalance: typeof (source.pointsBalance ?? source.points_balance) === "number"
      ? (source.pointsBalance ?? source.points_balance)
      : null,
  };
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
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const snap = getDiscoverSnapshot(boxSlug);

    if (snap && snap.boxSlug === boxSlug) {
      setBoxContent(normalizeDiscoverPayload(snap, boxSlug));
      setContentError("");
      setContentLoading(false);
      return () => {
        cancelled = true;
      };
    }

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
    let cancelled = false;

    (async () => {
      try {
        const url = `/box-management/articles/visible/?boxSlug=${encodeURIComponent(
          boxSlug
        )}&limit=${MAX_VISIBLE_ARTICLES}`;

        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        const data = await res.json().catch(() => []);

        if (!res.ok) {
          if (res.status === 403 && data?.code === "BOX_SESSION_REQUIRED") {
            clearBoxSession(boxSlug, { markExpired: true });
            navigate(`/flowbox/${encodeURIComponent(boxSlug)}/closed`, { replace: true });
            return;
          }
          throw new Error(data?.detail || "Impossible de charger les articles.");
        }
        if (cancelled) {return;}

        setArticles(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setArticles([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boxSlug, clearBoxSession, navigate]);

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

  useEffect(() => {
    const articleIdFromSearch = getDrawerParamValue(location, ARTICLE_DRAWER_PARAM);

    if (!articleIdFromSearch) {
      setSelectedArticle((prev) => (prev ? null : prev));
      return;
    }

    const nextArticle = articles.find(
      (article) => String(article?.id || "") === String(articleIdFromSearch)
    );

    if (!nextArticle) {
      return;
    }

    setSelectedArticle((prev) => {
      if (String(prev?.id || "") === String(nextArticle.id || "")) {
        return prev;
      }
      return nextArticle;
    });
  }, [articles, location]);

  const myDeposit = boxContent?.myDeposit || null;

  const mainDep = boxContent?.main || null;
  const successes = Array.isArray(boxContent?.successes)
    ? boxContent.successes
    : [];
  const olderDeposits = Array.isArray(boxContent?.olderDeposits)
    ? boxContent.olderDeposits
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
    const normalizedPatch = normalizeDiscoverPayload(patch, boxSlug);
    patchDiscoverSnapshot?.(boxSlug, normalizedPatch);
    setBoxContent((current) => ({
      ...(current || normalizeDiscoverPayload({}, boxSlug)),
      ...normalizedPatch,
      boxSlug,
    }));
  }, [boxSlug, patchDiscoverSnapshot]);

  const handleOpenArticleDrawer = useCallback(
    (article) => {
      if (!article?.id) {return;}
      setSelectedArticle(article);
      openDrawerWithHistory({
        navigate,
        location,
        param: ARTICLE_DRAWER_PARAM,
        value: article.id,
      });
    },
    [location, navigate]
  );

  const handleCloseArticleDrawer = useCallback(() => {
    const articleId =
      selectedArticle?.id ||
      getDrawerParamValue(location, ARTICLE_DRAWER_PARAM) ||
      "";

    if (
      !closeDrawerWithHistory({
        navigate,
        location,
        param: ARTICLE_DRAWER_PARAM,
        value: articleId,
      })
    ) {
      setSelectedArticle(null);
    }
  }, [location, navigate, selectedArticle?.id]);

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

      <ArticleDrawer
        article={selectedArticle}
        open={!!selectedArticle}
        onClose={handleCloseArticleDrawer}
        boxSlug={boxSlug}
      />

      <Box className="intro">
        <Typography component="h2" variant="h1">
          Bonne écoute !
        </Typography>
        <Typography component="span" variant="body1">
          Découvre la chanson déposée par le passant·e précédent
        </Typography>
      </Box>

      {mainDep ? (
        <Box sx={{ margin: "0 20px" }}>
          <Deposit dep={mainDep} user={user} variant="main" showPlay={true} showUser={true} />

          {olderDeposits.length > 0 ? (
            <Box
              sx={{
                mt: "26px",
                width: "100%",
                minHeight: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                color: "text.primary",
                opacity: 0.72,
              }}
            >
              <KeyboardArrowDownIcon aria-hidden="true" />
              <Typography component="span" variant="body1">
                Découvrir plus de chansons
              </Typography>
              <KeyboardArrowDownIcon aria-hidden="true" />
            </Box>
          ) : null}
        </Box>
      ) : (
        <Box sx={{ p: 3 }}>
          <Alert severity="info">
            Aucune chanson à découvrir pour le moment. Reviens bientôt : les prochains
            partages apparaîtront ici.
          </Alert>
        </Box>
      )}

      <LiveSearchSection
        boxSlug={boxSlug}
        myDeposit={myDeposit}
        successes={successes}
        pointsBalance={boxContent?.pointsBalance ?? null}
        onDepositCreated={handleDepositCreated}
        onOpenAchievements={handleOpenAchievements}
      />

      {articles.length > 0 ? (
        <Box className="articles_section">
          <Box className="articles_list">
            {articles.map((article, idx) => (
              <ArticleCard
                key={article?.id || `${article?.link || article?.title || "article"}-${idx}`}
                article={article}
                onOpenDrawer={handleOpenArticleDrawer}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      <PinnedSongSection boxSlug={boxSlug} />

      {olderDeposits.length > 0 ? (
        <Box id="older_deposit">
          <Box className="intro" sx={{ p: 4 }}>
            <Typography component="h2" variant="h3" sx={{ mt: 5 }}>
              Partages précédents
            </Typography>
            <Typography component="p" variant="body1">
              Ces chansons ont été déposées plus tôt dans cette boîte. Utilise tes
              points pour les révéler.
            </Typography>
          </Box>

          <Box id="older_deposits_list">
            {olderDeposits.map((d, idx) => (
              <Deposit
                key={d.public_key || idx}
                dep={d}
                user={user}
                variant="list"
                showPlay={true}
                showUser={true}
              />
            ))}
            <Typography component="p" variant="body1" sx={{ textAlign: "center" }}>
              Reviens nous voir bientôt, de nouvelles chansons auront été partagées
            </Typography>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
