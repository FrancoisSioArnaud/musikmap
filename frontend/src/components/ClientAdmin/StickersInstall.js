import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CameraAltRoundedIcon from "@mui/icons-material/CameraAltRounded";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { getCookie } from "../Security/TokensUtils";

function extractStickerSlug(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return "";
  if (/^\d{11}$/.test(raw)) return raw;

  const directMatch = raw.match(/(?:^|\/s\/)(\d{11})(?:$|[/?#])/);
  if (directMatch) return directMatch[1];

  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/s\/(\d{11})(?:\/)?$/);
    if (match) return match[1];
  } catch (error) {}

  return "";
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => ({}));
    return data?.detail || data?.message || "Action impossible.";
  }
  return (await response.text().catch(() => "")) || "Action impossible.";
}

export default function StickersInstall() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("sticker") || "");
  const [boxSearch, setBoxSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");
  const [sticker, setSticker] = useState(null);
  const [boxes, setBoxes] = useState([]);
  const [message, setMessage] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [assigningBoxId, setAssigningBoxId] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const scanLoopRef = useRef(null);
  const lastDetectionRef = useRef(0);

  const barcodeSupported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "BarcodeDetector" in window &&
      Boolean(navigator?.mediaDevices?.getUserMedia)
    );
  }, []);

  const stopCamera = useCallback(() => {
    if (scanLoopRef.current) {
      window.cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const fetchInstallState = useCallback(
    async (stickerSlug, currentBoxSearch = "") => {
      const normalizedSlug = extractStickerSlug(stickerSlug);
      if (!normalizedSlug) {
        setPageError("Slug sticker invalide.");
        setSticker(null);
        setBoxes([]);
        setMessage("");
        return;
      }

      setLoading(true);
      setPageError("");
      setPageSuccess("");

      try {
        const params = new URLSearchParams();
        params.set("sticker", normalizedSlug);
        if (currentBoxSearch.trim()) params.set("search", currentBoxSearch.trim());

        const response = await fetch(
          `/box-management/client-admin/stickers/install/?${params.toString()}`,
          { credentials: "same-origin" }
        );

        if (!response.ok) {
          throw new Error(await parseErrorResponse(response));
        }

        const data = await response.json().catch(() => ({}));
        setSticker(data?.sticker || null);
        setBoxes(Array.isArray(data?.boxes) ? data.boxes : []);
        setMessage(data?.message || "");
        setInputValue(normalizedSlug);
        setSearchParams({ sticker: normalizedSlug });
      } catch (error) {
        setSticker(null);
        setBoxes([]);
        setMessage("");
        setPageError(error.message || "Impossible de charger ce sticker.");
      } finally {
        setLoading(false);
      }
    },
    [setSearchParams]
  );

  useEffect(() => {
    const stickerSlug = searchParams.get("sticker") || "";
    if (stickerSlug) {
      fetchInstallState(stickerSlug, boxSearch);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sticker || sticker.box || !inputValue) return undefined;

    const timer = window.setTimeout(() => {
      fetchInstallState(inputValue, boxSearch);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [boxSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const handleLookupSubmit = async (event) => {
    event.preventDefault();
    await fetchInstallState(inputValue, boxSearch);
  };

  const handleAssign = async (boxId) => {
    if (!sticker?.id || !boxId) return;

    setAssigningBoxId(boxId);
    setPageError("");
    setPageSuccess("");

    try {
      const csrftoken = getCookie("csrftoken");
      const response = await fetch(
        `/box-management/client-admin/stickers/${sticker.id}/assign/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrftoken,
          },
          credentials: "same-origin",
          body: JSON.stringify({ box_id: boxId }),
        }
      );

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = await response.json().catch(() => ({}));
      setSticker(data?.sticker || null);
      setBoxes([]);
      setMessage(
        data?.sticker?.box?.slug
          ? `Sticker assigné à ${data.sticker.box.slug}`
          : "Sticker assigné."
      );
      setPageSuccess("Sticker assigné avec succès.");
    } catch (error) {
      setPageError(error.message || "Assignation impossible.");
    } finally {
      setAssigningBoxId(null);
    }
  };

  const handleReset = () => {
    stopCamera();
    setInputValue("");
    setBoxSearch("");
    setSticker(null);
    setBoxes([]);
    setMessage("");
    setPageError("");
    setPageSuccess("");
    setCameraError("");
    setSearchParams({});
  };

  const startCamera = useCallback(async () => {
    if (!barcodeSupported) {
      setCameraError("Le scan caméra n’est pas disponible sur ce navigateur.");
      return;
    }

    setCameraError("");
    setPageError("");

    try {
      detectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraActive(true);

      const scan = async () => {
        if (!videoRef.current || !detectorRef.current) {
          scanLoopRef.current = window.requestAnimationFrame(scan);
          return;
        }

        const now = Date.now();
        if (now - lastDetectionRef.current < 500) {
          scanLoopRef.current = window.requestAnimationFrame(scan);
          return;
        }

        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (Array.isArray(barcodes) && barcodes.length > 0) {
            const rawValue = barcodes[0]?.rawValue || "";
            const slug = extractStickerSlug(rawValue);
            if (slug) {
              lastDetectionRef.current = now;
              stopCamera();
              setInputValue(slug);
              fetchInstallState(slug, boxSearch);
              return;
            }
          }
        } catch (error) {}

        scanLoopRef.current = window.requestAnimationFrame(scan);
      };

      scanLoopRef.current = window.requestAnimationFrame(scan);
    } catch (error) {
      setCameraError("Impossible d’accéder à la caméra.");
      stopCamera();
    }
  }, [barcodeSupported, boxSearch, fetchInstallState, stopCamera]);

  return (
    <Stack spacing={3}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Box>
            <Typography variant="h4" gutterBottom>
              Installer des stickers
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Scanne un sticker, puis rattache-le rapidement à une box du client.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            component={RouterLink}
            to="/client/stickers"
            startIcon={<ArrowBackRoundedIcon />}
          >
            Retour aux stickers
          </Button>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack spacing={2} component="form" onSubmit={handleLookupSubmit}>
          <Typography variant="h6">Scanner ou saisir un sticker</Typography>

          <TextField
            label="Slug sticker ou URL scannée"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="12345678901 ou https://boiteachanson.fr/s/12345678901"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LocalOfferRoundedIcon />
                </InputAdornment>
              ),
            }}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Button type="submit" variant="contained" startIcon={<SearchRoundedIcon />}>
              Rechercher ce sticker
            </Button>
            <Button
              type="button"
              variant="outlined"
              startIcon={<CameraAltRoundedIcon />}
              onClick={cameraActive ? stopCamera : startCamera}
            >
              {cameraActive ? "Arrêter la caméra" : "Scanner avec la caméra"}
            </Button>
            <Button type="button" variant="text" startIcon={<RefreshRoundedIcon />} onClick={handleReset}>
              Scanner un autre sticker
            </Button>
          </Stack>

          {!barcodeSupported ? (
            <Alert severity="info">
              Le scan caméra n’est pas disponible ici. La saisie manuelle du slug reste utilisable.
            </Alert>
          ) : null}
          {cameraError ? <Alert severity="warning">{cameraError}</Alert> : null}

          {cameraActive ? (
            <Box
              sx={{
                position: "relative",
                width: "100%",
                maxWidth: 520,
                borderRadius: 3,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Box
                component="video"
                ref={videoRef}
                autoPlay
                muted
                playsInline
                sx={{ width: "100%", display: "block", backgroundColor: "#000" }}
              />
            </Box>
          ) : null}
        </Stack>
      </Paper>

      {pageError ? <Alert severity="error">{pageError}</Alert> : null}
      {pageSuccess ? <Alert severity="success">{pageSuccess}</Alert> : null}
      {message ? <Alert severity={sticker?.box ? "success" : "info"}>{message}</Alert> : null}

      {loading ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <CircularProgress />
        </Paper>
      ) : null}

      {sticker ? (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={1.5}>
            <Typography variant="h6">Sticker détecté</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip label={sticker.slug} color="primary" />
              <Chip label={sticker.status_label || sticker.status} variant="outlined" />
              <Chip label={sticker.is_active ? "Actif" : "Désactivé"} variant="outlined" />
              {sticker.box ? (
                <Chip
                  icon={<CheckCircleRoundedIcon />}
                  label={`Assigné à ${sticker.box.slug}`}
                  color="success"
                  variant="outlined"
                />
              ) : (
                <Chip label="Non assigné" variant="outlined" />
              )}
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {sticker && !sticker.box ? (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Stack spacing={2}>
            <TextField
              label="Rechercher une box"
              value={boxSearch}
              onChange={(event) => setBoxSearch(event.target.value)}
              placeholder="Nom ou slug de la box"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon />
                  </InputAdornment>
                ),
              }}
            />

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Box</TableCell>
                    <TableCell>Slug</TableCell>
                    <TableCell>Stickers déjà assignés</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {boxes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Box sx={{ py: 6, textAlign: "center" }}>
                          <Typography variant="body1">Aucune box trouvée.</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    boxes.map((box) => (
                      <TableRow key={box.id} hover>
                        <TableCell>{box.name}</TableCell>
                        <TableCell>{box.slug}</TableCell>
                        <TableCell>{box.assigned_sticker_count}</TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="contained"
                            onClick={() => handleAssign(box.id)}
                            disabled={assigningBoxId !== null}
                          >
                            {assigningBoxId === box.id ? "Assignation…" : "Assigner"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
