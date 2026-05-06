import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import React, { useCallback, useContext, useEffect, useState } from "react";
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
import DepositSearchSection from "./DepositSearchSection";
import MyDepositNotif from "./MyDepositNotif";
import PinnedSongSection from "./PinnedSongSection";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

const ACHIEVEMENTS_DRAWER_PARAM = "drawer";
const ACHIEVEMENTS_DRAWER_VALUE = "achievements";
const SEARCH_DRAWER_PARAM = "flowboxDrawer";
const SEARCH_DRAWER_VALUE = "deposit-search";
const ARTICLE_DRAWER_PARAM = "article";

function mapBoxContentApiToSnapshot(boxSlug, data) {
  return {
    boxSlug,
    main: data?.main || null,
    articles: Array.isArray(data?.articles) ? data.articles : [],
    olderDeposits: Array.isArray(data?.older_deposits) ? data.older_deposits : [],
    activePinnedDeposit: data?.active_pinned_deposit || null,
    myDeposit: data?.my_deposit || null,
    successes: [],
  };
}

export default function Discover() {
  const location = useLocation();
  const navigate = useNavigate();
  const { boxSlug } = useParams();

  const { setUser } = useContext(UserContext) || {};
  const { getDiscoverSnapshot, saveDiscoverSnapshot, clearBoxSession, getBoxRuntime } =
    useContext(FlowboxSessionContext);

  const [boxContent, setBoxContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [depositFlowState, setDepositFlowState] = useState({
    status: "idle",
    requestKey: null,
    errorMessage: null,
  });

  const [selectedArticle, setSelectedArticle] = useState(null);

  const searchOpen = matchesDrawerSearch(location, SEARCH_DRAWER_PARAM, SEARCH_DRAWER_VALUE);
  const achievementsOpen = matchesDrawerSearch(
    location,
    ACHIEVEMENTS_DRAWER_PARAM,
    ACHIEVEMENTS_DRAWER_VALUE
  );

  const runtime = getBoxRuntime(boxSlug);
  const searchIncitationText = String(runtime?.box?.searchIncitationText || "").trim();

  const openSearchDrawer = useCallback(() => {
    openDrawerWithHistory({
      navigate,
      location,
      param: SEARCH_DRAWER_PARAM,
      value: SEARCH_DRAWER_VALUE,
    });
  }, [location, navigate]);

  const closeSearchDrawer = useCallback(() => {
    closeDrawerWithHistory({
      navigate,
      location,
      param: SEARCH_DRAWER_PARAM,
      value: SEARCH_DRAWER_VALUE,
    });
  }, [location, navigate]);

  const openAchievementsDrawer = useCallback(() => {
    closeDrawerWithHistory({
      navigate,
      location,
      param: SEARCH_DRAWER_PARAM,
      value: SEARCH_DRAWER_VALUE,
    });
    openDrawerWithHistory({
      navigate,
      location,
      param: ACHIEVEMENTS_DRAWER_PARAM,
      value: ACHIEVEMENTS_DRAWER_VALUE,
    });
  }, [location, navigate]);

  const closeAchievementsDrawer = useCallback(() => {
    closeDrawerWithHistory({
      navigate,
      location,
      param: ACHIEVEMENTS_DRAWER_PARAM,
      value: ACHIEVEMENTS_DRAWER_VALUE,
    });
  }, [location, navigate]);

  const openArticleDrawer = useCallback(
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

  const closeArticleDrawer = useCallback(() => {
    closeDrawerWithHistory({
      navigate,
      location,
      param: ARTICLE_DRAWER_PARAM,
      value: selectedArticle?.id,
    });
    setSelectedArticle(null);
  }, [location, navigate, selectedArticle?.id]);

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError("");

    const localSnapshot = getDiscoverSnapshot(boxSlug);
    if (localSnapshot) {
      setBoxContent(localSnapshot);
      setLoading(false);
      return;
    }

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
      setError(data?.detail || "Erreur de chargement");
      setLoading(false);
      return;
    }

    const snapshot = mapBoxContentApiToSnapshot(boxSlug, data);
    saveDiscoverSnapshot(boxSlug, snapshot);
    setBoxContent(snapshot);

    if (data?.current_user && setUser) {
      setUser(data.current_user);
    }

    setLoading(false);
  }, [boxSlug, clearBoxSession, getDiscoverSnapshot, navigate, saveDiscoverSnapshot, setUser]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const articleId = getDrawerParamValue(location, ARTICLE_DRAWER_PARAM);
    if (!articleId || !boxContent?.articles?.length) {
      if (!articleId) {setSelectedArticle(null);}
      return;
    }

    const article = boxContent.articles.find((item) => String(item.id) === String(articleId));
    if (article) {
      setSelectedArticle(article);
    }
  }, [boxContent?.articles, location]);

  const myDeposit = boxContent?.myDeposit || null;
  const successes = Array.isArray(boxContent?.successes) ? boxContent.successes : [];
  const totalPoints =
    successes.find((item) => (item?.name || "").toLowerCase().includes("total"))?.points || 0;

  const handleDeposit = useCallback(
    async (option, requestKey) => {
      setDepositFlowState({ status: "pending", requestKey, errorMessage: null });

      const response = await fetch("/box-management/box-deposits/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ boxSlug, option }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDepositFlowState({
          status: "error",
          requestKey,
          errorMessage: data?.detail || "Erreur dépôt",
        });
        return;
      }

      const nextSnapshot = {
        ...(boxContent || {}),
        myDeposit: data?.my_deposit || null,
        successes: Array.isArray(data?.successes) ? data.successes : [],
      };

      saveDiscoverSnapshot(boxSlug, nextSnapshot);
      setBoxContent(nextSnapshot);

      if (setUser && data?.current_user) {
        setUser(data.current_user);
      }

      setDepositFlowState({ status: "success", requestKey, errorMessage: null });
      closeSearchDrawer();
      openAchievementsDrawer();
    },
    [boxContent, boxSlug, closeSearchDrawer, openAchievementsDrawer, saveDiscoverSnapshot, setUser]
  );

  if (loading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Drawer
        anchor="right"
        open={achievementsOpen}
        onClose={closeAchievementsDrawer}
        PaperProps={{ sx: { width: "100vw" } }}
      >
        <Box sx={{ height: "100%", overflowY: "auto", pb: 8 }}>
          {myDeposit ? <MyDepositNotif deposit={myDeposit} showPoints={false} /> : null}
          <AchievementsPanel successes={successes} />
        </Box>
        <Button onClick={closeAchievementsDrawer}>Fermer</Button>
      </Drawer>

      <ArticleDrawer
        article={selectedArticle}
        open={Boolean(selectedArticle)}
        onClose={closeArticleDrawer}
        boxSlug={boxSlug}
      />

      {myDeposit ? (
        <MyDepositNotif
          deposit={myDeposit}
          points={totalPoints}
          showPoints
          onPointsClick={openAchievementsDrawer}
        />
      ) : (
        <DepositSearchSection
          open={searchOpen}
          onOpen={openSearchDrawer}
          onClose={closeSearchDrawer}
          onSelectSong={handleDeposit}
          depositFlowState={depositFlowState}
          searchIncitationText={searchIncitationText}
        />
      )}

      {boxContent?.main ? (
        <Deposit deposit={boxContent.main} revealSongByDefault />
      ) : (
        <Alert severity="info" sx={{ m: 2 }}>
          Aucune chanson n’a encore été déposée.
        </Alert>
      )}

      <Box sx={{ px: 2 }}>
        {(boxContent?.articles || []).map((article) => (
          <ArticleCard key={article.id} article={article} onClick={() => openArticleDrawer(article)} />
        ))}
      </Box>

      <PinnedSongSection boxSlug={boxSlug} initialPinnedDeposit={boxContent?.activePinnedDeposit || null} />

      {(boxContent?.olderDeposits || []).map((deposit) => (
        <Deposit key={deposit.id || deposit.public_key} deposit={deposit} />
      ))}
    </Box>
  );
}
