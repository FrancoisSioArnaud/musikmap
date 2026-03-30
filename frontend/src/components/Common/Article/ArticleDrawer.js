import React, { useEffect, useState } from "react";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

export default function ArticleDrawer({ article, open, onClose, boxSlug }) {
  const previewText = typeof article?.short_text === "string" ? article.short_text : "";
  const [fullText, setFullText] = useState(previewText);
  const [loadingFullText, setLoadingFullText] = useState(false);

  useEffect(() => {
    setFullText(previewText);
  }, [article?.id, previewText, open]);

  useEffect(() => {
    if (!open || !article?.id || !boxSlug) {
      setLoadingFullText(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingFullText(true);

        const res = await fetch(
          `/box-management/articles/visible/${article.id}/?boxSlug=${encodeURIComponent(boxSlug)}`,
          {
            credentials: "include",
            headers: { Accept: "application/json" },
          }
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(data?.detail || "Impossible de charger l’article.");
        }

        if (cancelled) return;

        setFullText(typeof data?.short_text === "string" ? data.short_text : previewText);
      } catch {
        if (!cancelled) {
          setFullText(previewText);
        }
      } finally {
        if (!cancelled) {
          setLoadingFullText(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [article?.id, boxSlug, open, previewText]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ className: "drawer_paper" }}
      className="drawer"
    >
      <Box className="article_drawer_content">
        {article?.cover_image ? (
          <Box
            component="img"
            src={article.cover_image}
            alt={article?.title || "Illustration article"}
            className="image"
            sx={{ width: "100%" }}
          />
        ) : null}

        <Box className="text">
          {article?.title ? (
            <Typography component="h1" variant="h1" className="title">
              {article.title}
            </Typography>
          ) : null}

          {fullText ? (
            <Typography component="div" variant="body1" className="body">
              {fullText}
            </Typography>
          ) : null}

          {loadingFullText ? (
            <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
              <CircularProgress size={22} />
            </Box>
          ) : null}
        </Box>

        <Button variant="contained" onClick={onClose} className="bottom_fixed">
          Fermer
        </Button>
      </Box>
    </Drawer>
  );
}
