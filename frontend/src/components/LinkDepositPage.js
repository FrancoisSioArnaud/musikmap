import React, { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";

import Deposit from "./Common/Deposit";
import { UserContext } from "./UserContext";

function getSenderLabel(sender) {
  return sender?.display_name || sender?.username || "utilisateur inconnu";
}

export default function LinkDepositPage() {
  const navigate = useNavigate();
  const { linkSlug } = useParams();
  const { user, setCurrentClient } = useContext(UserContext) || {};

  const [loading, setLoading] = useState(true);
  const [pageCode, setPageCode] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [sender, setSender] = useState(null);
  const [deposit, setDeposit] = useState(null);
  const [boxData, setBoxData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    document.title = "Lien partagé";

    const existingRobots = document.querySelector('meta[name="robots"]');
    const hadExistingRobots = Boolean(existingRobots);
    const previousRobotsContent = existingRobots?.getAttribute("content") || "";
    const robotsMeta = existingRobots || document.createElement("meta");

    if (!hadExistingRobots) {
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }
    robotsMeta.setAttribute("content", "noindex,nofollow");

    async function loadLink() {
      setLoading(true);
      setPageCode("");
      setPageMessage("");
      setDeposit(null);
      setSender(null);
      setBoxData(null);

      try {
        const response = await fetch(
          `/box-management/links/${encodeURIComponent(linkSlug)}/`,
          {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          }
        );

        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          setPageCode(data?.code || "link_error");
          setPageMessage(
            data?.detail || "Impossible d’ouvrir ce lien pour le moment."
          );
          setSender(data?.sender || null);
          return;
        }

        if (data?.client_slug && setCurrentClient) {
          setCurrentClient(data.client_slug);
        }

        setSender(data?.sender || null);
        setDeposit(data?.deposit || null);
        setBoxData(data?.box || null);
      } catch {
        if (cancelled) return;
        setPageCode("network_error");
        setPageMessage("Impossible d’ouvrir ce lien pour le moment.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadLink();

    return () => {
      cancelled = true;
      if (hadExistingRobots) {
        robotsMeta.setAttribute("content", previousRobotsContent);
      } else if (robotsMeta.parentNode) {
        robotsMeta.parentNode.removeChild(robotsMeta);
      }
    };
  }, [linkSlug, setCurrentClient]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!deposit) {
    const senderLabel = getSenderLabel(sender);
    const isExpired = pageCode === "link_expired";

    return (
      <Box sx={{ px: "20px", py: 7, textAlign: "center" }}>
        <Typography variant="h4" component="h1" sx={{ mb: 2 }}>
          {isExpired ? "Lien expiré" : "Lien indisponible"}
        </Typography>
        <Typography variant="body1">
          {isExpired && sender
            ? `${pageMessage} Ce lien a été partagé par ${senderLabel}.`
            : pageMessage || "Ce lien ne peut pas être affiché."}
        </Typography>
      </Box>
    );
  }

  const senderLabel = getSenderLabel(sender);
  const canOpenSenderProfile = Boolean(sender?.username);
  const boxLabel =
    boxData?.name || boxData?.url || deposit?.box_name || "Inconnue";

  return (
    <Box sx={{ px: "20px", py: 4 }}>
      <Box sx={{ maxWidth: 760, mx: "auto" }}>
        <Box className="intro">
          <Typography
            variant="subtitle1"
            component="p"
            sx={{ textAlign: "center" }}
          >
            <Box
              component="span"
              role={canOpenSenderProfile ? "button" : undefined}
              tabIndex={canOpenSenderProfile ? 0 : undefined}
              onClick={() => {
                if (!canOpenSenderProfile) return;
                navigate(`/profile/${sender.username}`);
              }}
              onKeyDown={(event) => {
                if (!canOpenSenderProfile) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/profile/${sender.username}`);
                }
              }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                cursor: canOpenSenderProfile ? "pointer" : "default",
                verticalAlign: "middle",
              }}
            >
              <Box component="span">{senderLabel}</Box>
              {canOpenSenderProfile ? (
                <ArrowForwardIosIcon sx={{ fontSize: "0.9em" }} />
              ) : null}
            </Box>{" "}
            a découvert cette chanson dans la boîte à chanson "{boxLabel}".
            Il·Elle a pensé qu&apos;elle te plairait
          </Typography>
        </Box>

        <Deposit
          dep={deposit}
          user={user}
          variant="main"
          showDate={false}
          showUser={true}
          fitContainer={true}
          context="link"
        />
      </Box>
    </Box>
  );
}
