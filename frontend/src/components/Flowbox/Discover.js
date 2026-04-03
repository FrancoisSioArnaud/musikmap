// frontend/src/components/Flowbox/Discover.js
import React, { useEffect, useState, useContext, useCallback, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Drawer from "@mui/material/Drawer";
import Button from "@mui/material/Button";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MusicNote from "@mui/icons-material/MusicNote";

import Deposit from "../Common/Deposit";
import AchievementsPanel from "./AchievementsPanel";
import { UserContext } from "../UserContext";
import { getValid } from "../Utils/mmStorage";
import {
  getDiscoverPageStateKey,
  restoreScrollWhenReady,
  savePageScroll,
} from "../Utils/pageStateStorage";
import ArticleCard from "../Common/Article/ArticleCard";
import ArticleDrawer from "../Common/Article/ArticleDrawer";

const KEY_BOX_CONTENT = "mm_box_content";
const MAX_VISIBLE_ARTICLES = 5;

export default function Discover() {
  const navigate = useNavigate();
  const location = useLocation();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};

  const [boxContent, setBoxContent] = useState(null);
  const [openAchievements, setOpenAchievements] = useState(false);
  const [articles, setArticles] = useState([]);
  const [articlesLoaded, setArticlesLoaded] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);

  const pageStateKey = getDiscoverPageStateKey(location);
  const scrollSaveTimeoutRef = useRef(null);

  const redirectOnboardingExpired = useCallback(() => {
    navigate(`/flowbox/${encodeURIComponent(boxSlug)}/`, {
      replace: true,
      state: { error: "Erreur pendant le dépôt" },
    });
  }, [navigate, boxSlug]);

  useEffect(() => {
    const snap = getValid(KEY_BOX_CONTENT);
    if (!snap || snap.boxSlug !== boxSlug) {
      redirectOnboardingExpired();
      return;
    }
    setBoxContent(snap);
  }, [boxSlug, redirectOnboardingExpired]);

  useEffect(() => {
    let cancelled = false;
    setArticlesLoaded(false);

    (async () => {
      try {
        const url = `/box-management/articles/visible/?boxSlug=${encodeURIComponent(
          boxSlug
        )}&limit=${MAX_VISIBLE_ARTICLES}`;

        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          throw new Error("Impossible de charger les articles.");
        }

        const data = await res.json().catch(() => []);
        if (cancelled) return;

        setArticles(Array.isArray(data) ? data : []);
        setArticlesLoaded(true);
      } catch {
        if (!cancelled) {
          setArticles([]);
          setArticlesLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boxSlug]);

  useEffect(() => {
    const onScroll = () => {
      if (scrollSaveTimeoutRef.current) return;
      scrollSaveTimeoutRef.current = window.setTimeout(() => {
        scrollSaveTimeoutRef.current = null;
        savePageScroll(pageStateKey, window.scrollY);
      }, 150);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollSaveTimeoutRef.current) {
        clearTimeout(scrollSaveTimeoutRef.current);
        scrollSaveTimeoutRef.current = null;
      }
      savePageScroll(pageStateKey, window.scrollY);
    };
  }, [pageStateKey]);

  const isDiscoverPageReady = Boolean(boxContent) && articlesLoaded;

  useEffect(() => {
    return restoreScrollWhenReady(pageStateKey, isDiscoverPageReady);
  }, [pageStateKey, isDiscoverPageReady]);

  const myDeposit = boxContent?.myDeposit || null;
  const mySong = myDeposit?.song || null;

  const mainDep = boxContent?.main || null;
  const successes = Array.isArray(boxContent?.successes) ? boxContent.successes : [];
  const olderDeposits = Array.isArray(boxContent?.olderDeposits) ? boxContent.olderDeposits : [];

  const totalPoints =
    successes.find((s) => (s?.name || "").toLowerCase() === "total")?.points ??
    successes.find((s) => (s?.name || "").toLowerCase() === "points_total")?.points ??
    0;

  const handleOpenAchievements = () => setOpenAchievements(true);
  const handleCloseAchievements = () => setOpenAchievements(false);
  const handleOpenArticleDrawer = (article) => setSelectedArticle(article || null);
  const handleCloseArticleDrawer = () => setSelectedArticle(null);

  return (
    <Box>
      <Drawer
        anchor="right"
        open={openAchievements}
        onClose={() => {
          /* ignore backdrop click */
        }}
        ModalProps={{ disableEscapeKeyDown: true }}
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
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <CheckCircleIcon fontSize="medium" sx={{}} />
          <Typography component="h2" variant="h5">
            Chanson déposée avec succès
          </Typography>
        </Box>

        {mySong ? (
          <Box className="my_deposit deposit deposit_list deposit_song">
            <Box className="img_container">
              {mySong?.image_url ? (
                <Box
                  component="img"
                  src={mySong.image_url}
                  alt={mySong?.title || "Cover"}
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
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
          </Box>
        ) : null}

        <Box
          className="points_container"
          style={{ margin: "0 auto" }}
          onClick={handleOpenAchievements}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleOpenAchievements();
          }}
        >
          <Typography component="span" variant="body1">
            +{totalPoints}
          </Typography>
          <MusicNote fontSize="small" />
        </Box>
      </Box>

      {mainDep ? (
        <Deposit dep={mainDep} user={user} variant="main" fitContainer={true} />
      ) : null}

      {articles.length ? (
        <Box sx={{ display: "grid", gap: 2, p: 5 }}>
          {articles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onClick={() => handleOpenArticleDrawer(article)}
            />
          ))}
        </Box>
      ) : null}

      {olderDeposits.length ? (
        <Box sx={{ display: "grid", gap: 5, p: 5 }}>
          {olderDeposits.map((dep) => (
            <Deposit
              key={dep.public_key || dep.id}
              dep={dep}
              user={user}
              variant="list"
              fitContainer={true}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
