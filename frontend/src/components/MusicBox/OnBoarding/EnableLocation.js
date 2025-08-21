import React, { useState, useEffect, useContext } from "react";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { checkLocation } from "../BoxUtils";
import CircularProgress from "@mui/material/CircularProgress";

export default function EnableLocation({ setStage, boxInfo, navigate, className }) {
  // States & Variables

  const [isButtonClicked, setIsButtonClicked] = useState(false);

  function handleButtonClick() {
    setIsButtonClicked(true);
    checkLocation(boxInfo, navigate).then(() => setStage(2));
    document.getElementById('loader').style.display = "flex";
  }

  return (
    <>
      {boxInfo && Object.keys(boxInfo.box || {}).length > 0 ? (
        <div className={className} >
          <div className="enable-location__wrapper">
            <button className="btn-secondary">
              <span>
                {boxInfo.box.name}
              </span>
            </button>

            <h1>Autoriser la localisation</h1>

            <p>Confirme que tu es bien à coté du spot en partageant ta localisation. Ta localisation est uniquement utilisée pour ouvrir la boîte boîte.</p>

            <button
              className="btn-primary"
              onClick={handleButtonClick}
            >
                <span>Autoriser</span>
            </button>

          </div>
        </div>
        
      ) : (
        <div></div>
      )}
    </>
  );
}

