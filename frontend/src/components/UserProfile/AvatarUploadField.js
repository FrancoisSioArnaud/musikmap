import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React, { useEffect, useState } from "react";

import AvatarCropperModal from "./AvatarCropperModal";

export default function AvatarUploadField({
  label,
  currentImageUrl = "",
  buttonLabel = "Changer ma photo",
  disabled = false,
  inputId = "avatar-upload-input",
  avatarSize = 72,
  onCroppedFileChange,
}) {
  const [cropOpen, setCropOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const displayedImageUrl = previewUrl || currentImageUrl || "";

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {return;}
    setSelectedFile(file);
    setCropOpen(true);
  };

  const handleCancelCrop = () => {
    setCropOpen(false);
    setSelectedFile(null);
  };

  const handleConfirmCrop = (blob) => {
    const nextPreviewUrl = URL.createObjectURL(blob);
    const nextFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });

    setPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return nextPreviewUrl;
    });

    setCropOpen(false);
    setSelectedFile(null);
    onCroppedFileChange?.(nextFile, nextPreviewUrl, blob);
  };

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Avatar src={displayedImageUrl} sx={{ width: avatarSize, height: avatarSize }} />
        <Box>
          {label ? <Typography variant="subtitle2" sx={{ mb: 1 }}>{label}</Typography> : null}
          <label htmlFor={inputId}>
            <input id={inputId} type="file" accept="image/*" hidden onChange={handleFileSelect} />
            <Button variant="outlined" component="span" disabled={disabled}>{buttonLabel}</Button>
          </label>
        </Box>
      </Box>

      <AvatarCropperModal
        open={cropOpen}
        file={selectedFile}
        onCancel={handleCancelCrop}
        onConfirm={handleConfirmCrop}
      />
    </>
  );
}
