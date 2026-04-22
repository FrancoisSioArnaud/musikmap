// frontend/src/components/Flowbox/Discover.js
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MusicNote from "@mui/icons-material/MusicNote";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import PinnedSongSection from "./PinnedSongSection";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

const MAX_VISIBLE_ARTICLES = 5;
const ACHIEVEMENTS_DRAWER_PARAM = "drawer";
const ACHIEVEMENTS_DRAWER_VALUE = "achievements";
const ARTICLE_DRAWER_PARAM = "article";

export default function Discover() {
  const location = useLocation();
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};
  const { getDiscoverSnapshot } = useContext(FlowboxSessionContext);

  const [boxContent, setBoxContent] = useState(null);
  const [openAchievements, setOpenAchievements] = useState(false);
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);

  useEffect(() => {
    const snap = getDiscoverSnapshot(boxSlug);
    if (!snap || snap.boxSlug !== boxSlug) {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/search`, { replace: true });
      return;
    }
    setBoxContent(snap);
  }, [boxSlug, getDiscoverSnapshot, navigate]);

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
  }, [boxSlug]);

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
  const mySong = myDeposit?.song || null;
  const myDepositAccentColor = myDeposit?.accent_color || undefined;

  const mainDep = boxContent?.main || null;
  const successes = Array.isArray(boxContent?.successes)
    ? boxContent.successes
    : [];
  const olderDeposits = Array.isArray(boxContent?.olderDeposits)
    ? boxContent.olderDeposits
    : [];

  const totalPoints =
    successes.find((s) => (s?.name || "").toLowerCase() === "total")?.points ??
    successes.find((s) => (s?.name || "").toLowerCase() === "points_total")?.points ??
    0;

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

      <Box className="my_deposit_notif">
        <Box
          sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}
        >
          <CheckCircleIcon fontSize="medium" />
          <Typography component="h2" variant="h5">
            Chanson déposée avec succès
          </Typography>
        </Box>

        {mySong ? (
          <Box
            className={`my_deposit deposit deposit_song${
              myDepositAccentColor ? " has_accent_color" : ""
            }`}
            style={
              myDepositAccentColor
                ? { "--deposit-accent": myDepositAccentColor }
                : undefined
            }
          >
            <Box className="img_container">
              {mySong?.image_url ? (
                <Box
                  component="img"
                  src={mySong.image_url}
                  alt={mySong?.title || "Cover"}
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              ) : null}
            </Box>

            <Box className="texts">
              <Typography
                variant="h5"
                component="span"
                title={mySong?.title || ""}
                className="titre"
              >
                {mySong?.title || ""}
              </Typography>
              <Typography
                variant="body1"
                component="span"
                title={mySong?.artist || ""}
                className="artist"
              >
                {mySong?.artist || ""}
              </Typography>
            </Box>

            <Box
              className="points_container vertical"
              style={{ margin: "0 auto" }}
              onClick={handleOpenAchievements}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {handleOpenAchievements();}
              }}
            >
              <MusicNote />
              <Typography component="span" variant="body1">
                +{totalPoints}
              </Typography>
            </Box>
          </Box>
        ) : null}
      </Box>

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
      ) : null}

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
