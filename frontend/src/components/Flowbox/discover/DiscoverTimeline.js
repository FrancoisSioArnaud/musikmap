import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import ArticleCard from "../../Common/Article/ArticleCard";
import ArticleDrawer from "../../Common/Article/ArticleDrawer";
import Deposit from "../../Common/Deposit";
import {
  closeDrawerWithHistory,
  getDrawerParamValue,
  openDrawerWithHistory,
} from "../../Utils/drawerHistory";
import PinnedSongSection from "../PinnedSongSection";
import { FlowboxSessionContext } from "../runtime/FlowboxSessionContext";

const DISCOVER_OLDER_DEPOSITS_LIMIT = 100;
const MAX_VISIBLE_ARTICLES = 5;
const ARTICLE_DRAWER_PARAM = "article";

const PAGE_SIZE = 25;
const END_MESSAGE = "Tu as vu toutes les chansons disponibles dans cette boîte.";
const LIMIT_MESSAGE = "Tu as atteint la limite de chansons affichées pour cette session.";
const LOAD_ERROR_MESSAGE = "Impossible de charger plus de chansons pour le moment.";

function normalizeInitialDeposits(initialDeposits) {
  return Array.isArray(initialDeposits)
    ? initialDeposits.slice(0, DISCOVER_OLDER_DEPOSITS_LIMIT)
    : [];
}

function normalizeInitialHasMore(initialDeposits, initialHasMore) {
  return normalizeInitialDeposits(initialDeposits).length < DISCOVER_OLDER_DEPOSITS_LIMIT
    ? Boolean(initialHasMore)
    : false;
}

function normalizeInitialNextCursor(initialDeposits, initialNextCursor) {
  return normalizeInitialDeposits(initialDeposits).length < DISCOVER_OLDER_DEPOSITS_LIMIT
    ? initialNextCursor || null
    : null;
}

function haveSameDepositKeys(firstDeposits, secondDeposits) {
  if (firstDeposits.length !== secondDeposits.length) {return false;}

  return firstDeposits.every((deposit, index) => (
    deposit?.public_key === secondDeposits[index]?.public_key
  ));
}

function buildTimelineItems({ deposits, articles, hasInitialPinnedDeposit }) {
  const timelineItems = [];
  const availableDeposits = Array.isArray(deposits) ? deposits : [];
  const availableArticles = Array.isArray(articles) ? articles : [];
  let articleIndex = 0;
  let depositsSinceIntercalary = 0;
  let pinnedInserted = false;

  const pushPinnedItem = () => {
    if (pinnedInserted) {return;}
    timelineItems.push({ type: "pinned", key: "pinned" });
    pinnedInserted = true;
    depositsSinceIntercalary = 0;
  };

  if (hasInitialPinnedDeposit) {
    pushPinnedItem();
  }

  availableDeposits.forEach((deposit, index) => {
    timelineItems.push({
      type: "deposit",
      key: deposit?.public_key || `deposit-${index}`,
      deposit,
    });
    depositsSinceIntercalary += 1;

    if (!hasInitialPinnedDeposit && !pinnedInserted && depositsSinceIntercalary >= 2) {
      pushPinnedItem();
      return;
    }

    if (pinnedInserted && depositsSinceIntercalary >= 5 && articleIndex < availableArticles.length) {
      const article = availableArticles[articleIndex];
      timelineItems.push({
        type: "article",
        key: `article-${article?.id || articleIndex}`,
        article,
      });
      articleIndex += 1;
      depositsSinceIntercalary = 0;
    }
  });

  if (!pinnedInserted) {
    pushPinnedItem();
  }

  return timelineItems;
}

function mergeDepositsPage(existingDeposits, payload) {
  const loadedDeposits = Array.isArray(payload?.older_deposits)
    ? payload.older_deposits
    : [];
  const seenKeys = new Set(existingDeposits.map((deposit) => deposit?.public_key).filter(Boolean));
  const deduplicatedNewDeposits = loadedDeposits.filter((deposit) => {
    const key = deposit?.public_key;
    if (!key || seenKeys.has(key)) {return false;}
    seenKeys.add(key);
    return true;
  });
  const deposits = [...existingDeposits, ...deduplicatedNewDeposits]
    .slice(0, DISCOVER_OLDER_DEPOSITS_LIMIT);
  const limitReached = deposits.length >= DISCOVER_OLDER_DEPOSITS_LIMIT;

  return {
    deposits,
    nextCursor: limitReached ? null : (payload?.next_cursor || null),
    hasMore: limitReached ? false : Boolean(payload?.has_more),
  };
}

export default function DiscoverTimeline({
  boxSlug,
  initialDeposits = [],
  initialNextCursor = null,
  initialHasMore = false,
  activePinnedDeposit = null,
  user,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearBoxSession, patchDiscoverSnapshot } = useContext(FlowboxSessionContext);
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);
  const [deposits, setDeposits] = useState(() => normalizeInitialDeposits(initialDeposits));
  const [nextCursor, setNextCursor] = useState(() => normalizeInitialNextCursor(initialDeposits, initialNextCursor));
  const [hasMore, setHasMore] = useState(() => normalizeInitialHasMore(initialDeposits, initialHasMore));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [observerUnavailable, setObserverUnavailable] = useState(false);
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const hasInitialPinnedDepositRef = useRef(Boolean(activePinnedDeposit));

  useEffect(() => {
    const nextInitialDeposits = normalizeInitialDeposits(initialDeposits);

    setDeposits((currentDeposits) => (
      haveSameDepositKeys(currentDeposits, nextInitialDeposits)
        ? currentDeposits
        : nextInitialDeposits
    ));
    setNextCursor(normalizeInitialNextCursor(initialDeposits, initialNextCursor));
    setHasMore(normalizeInitialHasMore(initialDeposits, initialHasMore));
    setLoadError("");
  }, [initialDeposits, initialHasMore, initialNextCursor]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/box-management/articles/visible/?boxSlug=${encodeURIComponent(boxSlug)}&limit=${MAX_VISIBLE_ARTICLES}`,
          {
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );
        const data = await response.json().catch(() => []);

        if (!response.ok) {
          if (response.status === 403 && data?.code === "BOX_SESSION_REQUIRED") {
            clearBoxSession(boxSlug, { markExpired: true });
            navigate(`/flowbox/${encodeURIComponent(boxSlug)}/closed`, { replace: true });
            return;
          }
          throw new Error(data?.detail || "Impossible de charger les articles.");
        }

        if (!cancelled) {
          setArticles(Array.isArray(data) ? data : []);
        }
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
    const articleIdFromSearch = getDrawerParamValue(location, ARTICLE_DRAWER_PARAM);

    if (!articleIdFromSearch) {
      setSelectedArticle((prev) => (prev ? null : prev));
      return;
    }

    const nextArticle = articles.find(
      (article) => String(article?.id || "") === String(articleIdFromSearch)
    );

    if (!nextArticle) {return;}

    setSelectedArticle((prev) => {
      if (String(prev?.id || "") === String(nextArticle.id || "")) {
        return prev;
      }
      return nextArticle;
    });
  }, [articles, location]);

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

  const limitReached = deposits.length >= DISCOVER_OLDER_DEPOSITS_LIMIT;
  const canLoadMore = Boolean(hasMore && nextCursor && !limitReached);

  const loadNextPage = useCallback(async () => {
    if (!canLoadMore || loadingRef.current) {return;}
    loadingRef.current = true;
    setLoading(true);
    setLoadError("");

    try {
      const response = await fetch(
        `/box-management/box-older-deposits/?boxSlug=${encodeURIComponent(boxSlug)}&limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
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
        throw new Error(data?.detail || LOAD_ERROR_MESSAGE);
      }

      const pagination = mergeDepositsPage(deposits, data);
      setDeposits(pagination.deposits);
      setNextCursor(pagination.nextCursor);
      setHasMore(pagination.hasMore);
      patchDiscoverSnapshot?.(boxSlug, {
        boxSlug,
        olderDeposits: pagination.deposits,
        olderDepositsNextCursor: pagination.nextCursor,
        olderDepositsHasMore: pagination.hasMore,
      });
    } catch (error) {
      setLoadError(error?.message || LOAD_ERROR_MESSAGE);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [boxSlug, canLoadMore, clearBoxSession, deposits, navigate, nextCursor, patchDiscoverSnapshot]);

  useEffect(() => {
    if (!canLoadMore) {return undefined;}
    if (!("IntersectionObserver" in window)) {
      setObserverUnavailable(true);
      return undefined;
    }

    setObserverUnavailable(false);
    const sentinel = sentinelRef.current;
    if (!sentinel) {return undefined;}

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadNextPage();
      }
    }, { rootMargin: "220px 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore, loadNextPage]);

  const timelineItems = buildTimelineItems({
    deposits,
    articles,
    hasInitialPinnedDeposit: hasInitialPinnedDepositRef.current,
  });

  return (
    <>
      <ArticleDrawer
        article={selectedArticle}
        open={!!selectedArticle}
        onClose={handleCloseArticleDrawer}
        boxSlug={boxSlug}
      />

      <Box className="discover_timeline">
        <Box className="discover_timeline_list">
          {timelineItems.map((item) => {
            if (item.type === "pinned") {
              return (
                <Box
                  key={item.key}
                  className="discover_timeline_item discover_timeline_item--pinned"
                >
                  <PinnedSongSection
                    boxSlug={boxSlug}
                    initialPinnedDeposit={activePinnedDeposit}
                  />
                </Box>
              );
            }

            if (item.type === "article") {
              return (
                <Box
                  key={item.key}
                  className="discover_timeline_item discover_timeline_item--article"
                >
                  <ArticleCard
                    article={item.article}
                    onOpenDrawer={() => handleOpenArticleDrawer(item.article)}
                  />
                </Box>
              );
            }

            return (
              <Box
                key={item.key}
                className="discover_timeline_item discover_timeline_item--deposit"
              >
                <Deposit
                  dep={item.deposit}
                  user={user}
                  showPlay={true}
                  showUser={true}
                />
              </Box>
            );
          })}

          <Box ref={sentinelRef} sx={{ minHeight: 24 }} aria-hidden="true" />

          {loading ? (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, py: 2 }}>
              <CircularProgress size={18} />
              <Typography component="span" variant="body2">
                Chargement de chansons précédentes…
              </Typography>
            </Box>
          ) : null}

          {loadError ? (
            <Alert severity="warning" sx={{ mx: 2, my: 2 }}>
              {loadError}
            </Alert>
          ) : null}

          {observerUnavailable && canLoadMore ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <Button variant="outlined" onClick={loadNextPage} disabled={loading}>
                Voir plus
              </Button>
            </Box>
          ) : null}

          {!loading && deposits.length > 0 && limitReached ? (
            <Typography component="p" variant="body1" sx={{ textAlign: "center", p: 2 }}>
              {LIMIT_MESSAGE}
            </Typography>
          ) : null}

          {!loading && deposits.length > 0 && !limitReached && !hasMore ? (
            <Typography component="p" variant="body1" sx={{ textAlign: "center", p: 2 }}>
              {END_MESSAGE}
            </Typography>
          ) : null}

          {!loading && canLoadMore && !observerUnavailable ? (
            <Box
              sx={{
                py: 2,
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
                D’autres chansons arrivent en scrollant
              </Typography>
              <KeyboardArrowDownIcon aria-hidden="true" />
            </Box>
          ) : null}
        </Box>
      </Box>
    </>
  );
}
