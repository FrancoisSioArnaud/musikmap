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

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text, maxLength = 220) {
  const value = stripMarkdown(text);
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

export default function ArticleCard({ article, onOpenDrawer }) {
  const domainLabel = useMemo(() => getDomainLabel(article?.link), [article?.link]);
  const previewText = useMemo(() => truncateText(article?.short_text, 220), [article?.short_text]);
  const fallbackLinkLabel = useMemo(() => {
    const clientSlug = String(article?.client_slug || "").trim();
    return clientSlug ? `À lire, par ${clientSlug}` : "À lire";
  }, [article?.client_slug]);

  const handleClick = () => {
    if (article?.link) {
      window.open(article.link, "_blank", "noopener,noreferrer");
      return;
    }
    onOpenDrawer?.(article);
  };

  return (
    <Box className="card article" onClick={handleClick}>
      {article?.cover_image ? (
        <Box className="img_container">
          <Box
            component="img"
            src={article.cover_image}
            alt={article?.title || "Illustration article"}
            className="image"
          />
        </Box>
      ) : null}

      <Box className="content">
        <Box className="linkline">
          {article?.favicon ? (
            <Box
              component="img"
              src={article.favicon}
              alt=""
              aria-hidden="true"
              className="favicon"
            />
          ) : null}

          <Typography component="span" variant="body2" className="domain">
            {domainLabel || fallbackLinkLabel}
          </Typography>

          {domainLabel ? <OpenInNewIcon className="external_icon" fontSize="inherit" /> : null}
        </Box>

        <Typography component="h4" variant="h4" className="title">
          {article?.title || ""}
        </Typography>

        {previewText ? (
          <Typography variant="body1" className="text">
            {previewText}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
