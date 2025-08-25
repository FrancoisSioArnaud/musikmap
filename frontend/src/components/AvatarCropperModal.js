// frontend/src/components/AvatarCropperModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic"; // Si tu n'es pas en Next, supprime cette ligne
import Cropper from "react-easy-crop";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Button from "@mui/material/Button";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import * as exifr from "exifr";
import heic2any from "heic2any";

// --- Utils canvas ---
async function fileToImage(file) {
  // HEIC/HEIF → JPEG via heic2any si nécessaire
  const type = (file.type || "").toLowerCase();
  let blob = file;

  if (!type || type.includes("heic") || type.includes("heif")) {
    try {
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
      // heic2any peut renvoyer un Blob ou un tableau de Blobs
      blob = Array.isArray(out) ? out[0] : out;
    } catch (e) {
      throw new Error("Impossible de lire ce format (HEIC/HEIF).");
    }
  }

  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url, blob });
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = url;
  });
}

function getRadianAngle(degree) {
  return (degree * Math.PI) / 180;
}

function rotateSize(width, height, rotation) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * Dessine dans un canvas en corrigeant l'orientation EXIF (rotation + flip si besoin)
 * Retourne un canvas prêt pour crop.
 */
async function drawWithExifOrientation(image, blob) {
  const meta = await exifr.parse(blob).catch(() => null);
  const orientation = meta?.Orientation || meta?.orientation || 1;

  // Pas de rotation → on renvoie un canvas direct image
  if (!orientation || orientation === 1) {
    const c = document.createElement("canvas");
    c.width = image.naturalWidth || image.width;
    c.height = image.naturalHeight || image.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return c;
  }

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");

  // Patterns EXIF (1..8). On gère rotate/flip basique.
  // Réf: https://i.stack.imgur.com/VGS69.jpg
  switch (orientation) {
    case 2: // horizontal flip
      c.width = width; c.height = height;
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3: // 180°
      c.width = width; c.height = height;
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4: // vertical flip
      c.width = width; c.height = height;
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5: // vertical flip + 90° right
      c.width = height; c.height = width;
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6: // 90° right
      c.width = height; c.height = width;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;
    case 7: // horizontal flip + 90° right
      c.width = height; c.height = width;
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8: // 90° left
      c.width = height; c.height = width;
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;
    default:
      c.width = width; c.height = height;
  }

  ctx.drawImage(image, 0, 0);
  return c;
}

/**
 * Découpe (crop) un carré 1:1 à partir d'un canvas source, puis redimensionne à 512x512
 */
function cropAndResize(sourceCanvas, cropPixels, outSize = 512) {
  const { x, y, width, height } = cropPixels;

  // 1) Crop vers un canvas intermédiaire
  const cropC = document.createElement("canvas");
  cropC.width = width;
  cropC.height = height;
  const cropCtx = cropC.getContext("2d");
  cropCtx.drawImage(
    sourceCanvas,
    x, y, width, height,
    0, 0, width, height
  );

  // 2) Resize en 512x512
  const out = document.createElement("canvas");
  out.width = outSize;
  out.height = outSize;
  const outCtx = out.getContext("2d");
  // meilleure qualité
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(cropC, 0, 0, outSize, outSize);

  return out;
}

/**
 * Génère Blob JPEG à partir d'un canvas
 */
async function canvasToJpegBlob(canvas, quality = 0.8) {
  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export default function AvatarCropperModal({ open, file, onCancel, onConfirm }) {
  const [image, setImage] = useState(null); // HTMLImageElement
  const [sourceCanvas, setSourceCanvas] = useState(null); // canvas corrigé EXIF
  const [zoom, setZoom] = useState(1.2);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let revoke;
    async function load() {
      setError("");
      if (!file) return;
      try {
        const { img, url, blob } = await fileToImage(file);
        revoke = url;
        setImage(img);

        const srcCanvas = await drawWithExifOrientation(img, blob);
        setSourceCanvas(srcCanvas);
      } catch (e) {
        setError(e.message || "Fichier invalide.");
      }
    }
    load();
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
      setImage(null);
      setSourceCanvas(null);
    };
  }, [file]);

  const onCropComplete = (_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const handleConfirm = async () => {
    if (!sourceCanvas || !croppedAreaPixels) return;
    const out512 = cropAndResize(sourceCanvas, croppedAreaPixels, 512);
    const blob = await canvasToJpegBlob(out512, 0.8);
    if (!blob) {
      setError("Impossible de générer l’image.");
      return;
    }
    if (blob.size > 2 * 1024 * 1024) {
      setError("Image finale trop lourde (> 2 Mo). Réduis un peu le zoom.");
      return;
    }
    onConfirm?.(blob);
  };

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Recadrer la photo</DialogTitle>
      <DialogContent dividers sx={{ display: "grid", gap: 2 }}>
        {error && (
          <Typography color="error" variant="body2">{error}</Typography>
        )}

        <Box sx={{ position: "relative", width: "100%", height: 360, bgcolor: "#111", borderRadius: 1, overflow: "hidden" }}>
          {sourceCanvas && image && (
            <Cropper
              image={sourceCanvas.toDataURL("image/jpeg", 0.92)}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition={true}
              objectFit="contain"
            />
          )}
        </Box>

        <Box sx={{ px: 2 }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>Zoom</Typography>
          <Slider
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(_, v) => setZoom(v)}
            aria-label="Zoom"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Annuler</Button>
        <Button variant="contained" onClick={handleConfirm}>Valider</Button>
      </DialogActions>
    </Dialog>
  );
}
