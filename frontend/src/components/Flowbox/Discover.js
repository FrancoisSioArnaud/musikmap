// frontend/src/components/Flowbox/Discover.js
import React, { useEffect, useState, useContext, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";

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
import ArticleCard from "../Common/Article/ArticleCard";
import ArticleDrawer from "../Common/Article/ArticleDrawer";

const KEY_BOX_CONTENT = "mm_box_content";
const MAX_VISIBLE_ARTICLES = 5;

export default function Discover() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();
  const { user } = useContext(UserContext) || {};

  const [boxContent, setBoxContent] = useState(null);
  const [openAchievements, setOpenAchievements] = useState(false);
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);


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

  const myDeposit = boxContent?.myDeposit || null;
  const mySong = myDeposit?.song || null;
  const myDepositAccentColor = myDeposit?.accent_color || undefined;

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
          <CheckCircleIcon fontSize="medium" />
          <Typography component="h2" variant="h5">
            Chanson déposée avec succès
          </Typography>
        </Box>

        {mySong ? (
          <Box
            className={`my_deposit deposit_card deposit_song${
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
          <MusicNote />
          <Typography component="span" variant="body1" sx={{ paddingRight: "6px" }}>
            Voir le détail
          </Typography>
        </Box>
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
          <Deposit
            dep={mainDep}
            user={user}
            variant="main"
            showPlay={true}
            showUser={true}
          />
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

      {olderDeposits.length > 0 ? (
        <Box id="older_deposits">
          <Box className="intro" sx={{ p: 4 }}>
            <Typography component="h2" variant="h3" sx={{ mt: 5 }}>
              Partages précédents
            </Typography>
            <Typography component="p" variant="body1">
              Ces chansons ont été déposées plus tôt dans cette boîte. Utilise tes points pour les
              révéler.
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
