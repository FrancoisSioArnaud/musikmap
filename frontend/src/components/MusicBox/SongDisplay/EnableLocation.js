// frontend/src/components/MusicBox/SongDisplay/EnableLocation.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import { checkLocation } from "../BoxUtils";

export default function EnableLocation({ setStage, boxInfo, className }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleButtonClick() {
    if (!boxInfo || !boxInfo.box) return;
    setLoading(true);
    try {
      await checkLocation(boxInfo, navigate);
      // Une fois la géoloc validée → on passe à l’étape 2
      setStage?.(2);
    } finally {
      setLoading(false);
    }
  }

  if (!boxInfo || !boxInfo.box) return null;

  return (
    <div className={className}>
      <div className="enable-location__wrapper">
        <button className="btn-secondary" type="button" disabled>
          <span>{boxInfo.box.name}</span>
        </button>

        <h1>Autoriser la localisation</h1>

        <p>
          Confirme que tu es bien à côté du spot en partageant ta localisation.
          Ta localisation est uniquement utilisée pour ouvrir la boîte.
        </p>

        <button
          className="btn-primary"
          type="button"
          onClick={handleButtonClick}
          disabled={loading}
        >
          <span>{loading ? "Vérification..." : "Autoriser"}</span>
        </button>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
            <CircularProgress size={22} />
          </div>
        )}
      </div>
    </div>
  );
}
