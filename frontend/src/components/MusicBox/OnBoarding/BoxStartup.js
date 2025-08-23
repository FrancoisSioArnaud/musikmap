// frontend/src/components/MusicBox/OnBoarding/BoxStartup.js
import React from "react";
import Paper from "@mui/material/Paper";

export default function BoxStartup({ setStage, boxInfo, className }) {
  const box = boxInfo?.box || {};
  const boxName = box?.name || "";
  const depositCount = typeof boxInfo?.deposit_count === "number" ? boxInfo.deposit_count : 0;

  const isLoaded = Boolean(boxName); // on considère “chargé” si on a au moins le nom

  if (!isLoaded) {
    return (
      <div className={className} style={{ padding: 16, textAlign: "center" }}>
        Chargement…
      </div>
    );
  }

  return (
    <Paper className={className} elevation={3}>
      <div className="decoration" />
      <div className="bottom-content">
        <div className="bottom-content__wrapper">
          <button className="btn-secondary">
            <span>{boxName}</span>
          </button>

          <h1>
            {depositCount} pépites 💎 déposées ici, ajoutes-en une pour les découvrir
          </h1>

          <button className="btn-primary" onClick={() => setStage(1)}>
            <span>Commencer</span>
          </button>
        </div>
      </div>
    </Paper>
  );
}
