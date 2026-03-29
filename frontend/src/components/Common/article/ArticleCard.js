import React, { useMemo } from "react";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";

function getDomainLabel(url) {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    return (parsed.hostname || "").replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function truncateText(text, maxLength = 220) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

export default function ArticleCard({ article, onOpenDrawer }) {
  const domainLabel = useMemo(() => getDomainLabel(article?.link), [article?.link]);
  const previewText = useMemo(() => truncateText(article?.short_text, 220), [article?.short_text]);

  const handleClick = () => {
    if (article?.link) {
      window.open(article.link, "_blank", "noopener,noreferrer");
      return;
    }
    onOpenDrawer?.(article);
  };

  return (
    <Box className="card" onClick={handleClick}>
      {domainLabel ? (
        <Box className="linkline">
          <Typography component="span" variant="body2" className="domain">
            {domainLabel}
          </Typography>
          <OpenInNewIcon className="external_icon" fontSize="inherit" />
        </Box>
      ) : null}

      {article?.cover_image ? (
        <Box
          component="img"
          src={article.cover_image}
          alt={article?.title || "Illustration article"}
          className="image"
        />
      ) : null}

      <Typography component="h3" variant="h3" className="title">
        {article?.title || ""}
      </Typography>

      {previewText ? (
        <Typography variant="body1" className="text">
          {previewText}
        </Typography>
      ) : null}
    </Box>
  );
}
