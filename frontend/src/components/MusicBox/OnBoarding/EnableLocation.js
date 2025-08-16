
import React, { useState, useEffect } from "react";
import { checkLocation } from "../BoxUtils";
import { useError } from "../../ErrorContext";

export default function EnableLocation({ setStage, boxInfo, navigate, className }) {
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const { error, setError } = useError();

  async function handleButtonClick() {
    setIsButtonClicked(true);
    const status = await checkLocation(boxInfo);
    if (status === "success") {
      setStage(2);
    } else {
      setError({ title: "Oops !", message: status });
    }
    document.getElementById('loader').style.display = "flex";
  }

  return (
    <>
      {boxInfo && Object.keys(boxInfo.box || {}).length > 0 ? (
        <div className={className}>
          <div className="enable-location__wrapper">
            <button className="box-name">
              <span>
                {boxInfo.box.name}
              </span>
            </button>

            <h1>Nous avons besoin de ta localisation</h1>

            <p>Pour éviter les petits tricheurs, les boîtes ne peuvent être ouvertes qu’en étant sur place.</p>

            <p>Ta localisation est uniquement utilisée à l’ouverture d’une boîte</p>

            <button
              className="btn-primary"
              onClick={handleButtonClick}
            >
              <span>Autoriser</span>
            </button>

          </div>
        </div>
      ) : (
        <div>Loading...</div>
      )}
    </>
  );
}

