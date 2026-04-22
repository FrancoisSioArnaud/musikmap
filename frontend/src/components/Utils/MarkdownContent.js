
import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import React, { Fragment, useMemo } from "react";

function renderInline(text, keyPrefix = "inline") {
  const source = String(text || "");
  const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

  const nodes = [];
  let lastIndex = 0;
  let match;
  let index = 0;

  while ((match = regex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(source.slice(lastIndex, match.index));
    }

    if (match[1]) {
      nodes.push(
        <Box component="strong" key={`${keyPrefix}-strong-${index}`} sx={{ fontWeight: 700 }}>
          {match[2]}
        </Box>
      );
    } else if (match[3]) {
      nodes.push(
        <Box component="em" key={`${keyPrefix}-em-${index}`} sx={{ fontStyle: "italic" }}>
          {match[4]}
        </Box>
      );
    } else if (match[5]) {
      nodes.push(
        <Box
          component="code"
          key={`${keyPrefix}-code-${index}`}
          sx={{
            fontFamily: "monospace",
            px: 0.5,
            py: 0.125,
            borderRadius: 0.5,
            bgcolor: "rgba(255,255,255,0.08)",
          }}
        >
          {match[6]}
        </Box>
      );
    } else if (match[7]) {
      nodes.push(
        <Link
          key={`${keyPrefix}-link-${index}`}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          underline="hover"
        >
          {match[8]}
        </Link>
      );
    }

    lastIndex = regex.lastIndex;
    index += 1;
  }

  if (lastIndex < source.length) {
    nodes.push(source.slice(lastIndex));
  }

  return nodes.map((node, idx) => (
    <Fragment key={`${keyPrefix}-${idx}`}>{node}</Fragment>
  ));
}

function buildBlocks(markdown) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks = [];

  let paragraphLines = [];
  let bulletItems = [];
  let orderedItems = [];
  let quoteLines = [];
  let codeLines = [];
  let inCodeFence = false;

  const flushParagraph = () => {
    if (!paragraphLines.length) {return;}
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ").trim() });
    paragraphLines = [];
  };

  const flushBullets = () => {
    if (!bulletItems.length) {return;}
    blocks.push({ type: "ul", items: [...bulletItems] });
    bulletItems = [];
  };

  const flushOrdered = () => {
    if (!orderedItems.length) {return;}
    blocks.push({ type: "ol", items: [...orderedItems] });
    orderedItems = [];
  };

  const flushQuote = () => {
    if (!quoteLines.length) {return;}
    blocks.push({ type: "blockquote", text: quoteLines.join("\n").trim() });
    quoteLines = [];
  };

  const flushCode = () => {
    if (!codeLines.length) {return;}
    blocks.push({ type: "code", text: codeLines.join("\n") });
    codeLines = [];
  };

  const flushAllTextual = () => {
    flushParagraph();
    flushBullets();
    flushOrdered();
    flushQuote();
  };

  for (const line of lines) {
    const rawLine = line || "";
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeFence) {
        flushCode();
        inCodeFence = false;
      } else {
        flushAllTextual();
        inCodeFence = true;
      }
      continue;
    }

    if (inCodeFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flushAllTextual();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushAllTextual();
      blocks.push({
        type: `h${headingMatch[1].length}`,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushBullets();
      flushOrdered();
      quoteLines.push(quoteMatch[1]);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushBullets();
      flushQuote();
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      flushOrdered();
      flushQuote();
      bulletItems.push(bulletMatch[1]);
      continue;
    }

    flushBullets();
    flushOrdered();
    flushQuote();
    paragraphLines.push(trimmed);
  }

  if (inCodeFence) {
    flushCode();
  }

  flushAllTextual();
  return blocks;
}

export default function MarkdownContent({ markdown, className = "" }) {
  const blocks = useMemo(() => buildBlocks(markdown), [markdown]);

  return (
    <Box className={className}>
      {blocks.map((block, index) => {
        if (block.type === "h1") {
          return (
            <Typography key={index} component="h2" variant="h4" sx={{ fontWeight: 700, mt: index ? 2 : 0, mb: 1 }}>
              {renderInline(block.text, `h1-${index}`)}
            </Typography>
          );
        }

        if (block.type === "h2") {
          return (
            <Typography key={index} component="h3" variant="h5" sx={{ fontWeight: 700, mt: index ? 2 : 0, mb: 1 }}>
              {renderInline(block.text, `h2-${index}`)}
            </Typography>
          );
        }

        if (block.type === "h3") {
          return (
            <Typography key={index} component="h4" variant="h6" sx={{ fontWeight: 700, mt: index ? 2 : 0, mb: 1 }}>
              {renderInline(block.text, `h3-${index}`)}
            </Typography>
          );
        }

        if (block.type === "paragraph") {
          return (
            <Typography key={index} component="p" variant="body1" sx={{ mb: 1.5, whiteSpace: "normal" }}>
              {renderInline(block.text, `p-${index}`)}
            </Typography>
          );
        }

        if (block.type === "blockquote") {
          return (
            <Box
              key={index}
              sx={{
                borderLeft: "3px solid",
                borderColor: "divider",
                pl: 1.5,
                ml: 0.5,
                my: 1.5,
                opacity: 0.9,
              }}
            >
              {block.text.split("\n").map((line, lineIndex) => (
                <Typography key={lineIndex} component="p" variant="body1" sx={{ mb: 0.5 }}>
                  {renderInline(line, `quote-${index}-${lineIndex}`)}
                </Typography>
              ))}
            </Box>
          );
        }

        if (block.type === "ul" || block.type === "ol") {
          const Component = block.type === "ol" ? "ol" : "ul";
          return (
            <Box key={index} component={Component} sx={{ pl: 3, my: 1.5 }}>
              {block.items.map((item, itemIndex) => (
                <Box key={itemIndex} component="li" sx={{ mb: 0.5 }}>
                  <Typography component="span" variant="body1">
                    {renderInline(item, `list-${index}-${itemIndex}`)}
                  </Typography>
                </Box>
              ))}
            </Box>
          );
        }

        if (block.type === "code") {
          return (
            <Box
              key={index}
              component="pre"
              sx={{
                fontFamily: "monospace",
                fontSize: "0.95rem",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
                p: 1.5,
                my: 1.5,
                borderRadius: 1,
                bgcolor: "rgba(255,255,255,0.06)",
              }}
            >
              {block.text}
            </Box>
          );
        }

        return null;
      })}
    </Box>
  );
}
