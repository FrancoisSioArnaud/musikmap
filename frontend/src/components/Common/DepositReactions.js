import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import AddReactionIcon from "@mui/icons-material/AddReaction";

export default function DepositReactions({
  items = [],
  reactions = [],
  myReactionEmoji = null,
  viewerId = null,
  onOpenReact,
  onOpenSummary,
}) {
  const list = Array.isArray(items) ? items : [];
  const rx = Array.isArray(reactions) ? reactions : [];

  const currentEmoji =
    myReactionEmoji ??
    (viewerId
      ? rx.find((r) => (r?.user?.id || null) === viewerId)?.emoji ?? null
      : null);

  const hasMyReaction = Boolean(currentEmoji);

  const orderedList = hasMyReaction
    ? [
        ...list.filter((it) => it?.emoji !== currentEmoji),
        ...list.filter((it) => it?.emoji === currentEmoji),
      ]
    : list;

  return (
    <Box className="deposit_react">
      {orderedList.map((it, i) => {
        const isCurrent = Boolean(currentEmoji && it?.emoji === currentEmoji);

        const handleClick = (e) => {
          e.stopPropagation();
          if (isCurrent) {
            onOpenReact?.();
          } else {
            onOpenSummary?.();
          }
        };

        const handleKeyDown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick(e);
          }
        };

        return (
          <Box
            key={`${it?.emoji || i}-${it?.count || 0}`}
            className={isCurrent ? "current_reaction reaction" : "reaction"}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
          >
            <Typography variant="h4" component="span">
              {it?.emoji}
            </Typography>
            <Typography variant="h5" component="span">
              × {it?.count}
            </Typography>
          </Box>
        );
      })}

      {!hasMyReaction && (
        <Box
          className="icon_container"
          aria-label="Réagir"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onOpenReact?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOpenReact?.();
            }
          }}
        >
          <AddReactionIcon color="primary" />
        </Box>
      )}
    </Box>
  );
}
