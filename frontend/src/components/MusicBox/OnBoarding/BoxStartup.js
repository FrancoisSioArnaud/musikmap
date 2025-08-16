import React, { useState, useEffect, useContext } from "react";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

export default function BoxStartup({ setStage, boxInfo, className }) {
  return (
    <>
      {boxInfo && Object.keys(boxInfo.box || {}).length > 0 ? (
        <Paper
          className={className}
          elevation={3}
        >
          <div className="decoration" style={{ paddingLeft: '10px', paddingRight: '10px', boxSizing: 'border-box' }}>
            <div className="decoration__wrapper">
              {boxInfo.box.last_deposits.map((deposit, index) => (
                <div className="song-cover" key={index}>
                  <div className="cadre">
                    <div className="image-wrapper">
                      <svg xmlns="http://www.w3.org/2000/svg" width="105" height="113" viewBox="0 0 105 113" fill="none">
                        <g filter="url(#filter0_d_3213_12549)">
                          <path d="M76.375 40.5H72.375V32.5C72.375 21.46 63.415 12.5 52.375 12.5C41.335 12.5 32.375 21.46 32.375 32.5V40.5H28.375C23.975 40.5 20.375 44.1 20.375 48.5V88.5C20.375 92.9 23.975 96.5 28.375 96.5H76.375C80.775 96.5 84.375 92.9 84.375 88.5V48.5C84.375 44.1 80.775 40.5 76.375 40.5ZM52.375 76.5C47.975 76.5 44.375 72.9 44.375 68.5C44.375 64.1 47.975 60.5 52.375 60.5C56.775 60.5 60.375 64.1 60.375 68.5C60.375 72.9 56.775 76.5 52.375 76.5ZM64.775 40.5H39.975V32.5C39.975 25.66 45.535 20.1 52.375 20.1C59.215 20.1 64.775 25.66 64.775 32.5V40.5Z" fill="white" />
                        </g>
                        <defs>
                          <filter id="filter0_d_3213_12549" x="-13.625" y="-7.5" width="132" height="132" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                            <feFlood floodOpacity="0" result="BackgroundImageFix" />
                            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha" />
                            <feOffset dy="2" />
                            <feGaussianBlur stdDeviation="7" />
                            <feComposite in2="hardAlpha" operator="out" />
                            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.07 0" />
                            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_3213_12549" />
                            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_3213_12549" result="shape" />
                          </filter>
                        </defs>
                      </svg>
                      <img src={deposit.image_url} />
                    </div>
                  </div>

                  <svg xmlns="http://www.w3.org/2000/svg" width="121" height="120" viewBox="0 0 121 120" fill="none">
                    <rect x="0.625" width="120" height="120" rx="60" fill="black" />
                    <path d="M0.625 60C0.625 26.8629 27.4879 0 60.625 0C93.7621 0 120.625 26.8629 120.625 60C120.625 93.1371 93.7621 120 60.625 120C27.4879 120 0.625 93.1371 0.625 60Z" fill="url(#paint0_radial_3213_12555)" fillOpacity="0.2" />
                    <rect x="40.625" y="40" width="40" height="40" rx="20" fill="#A1CFA1" />
                    <defs>
                      <radialGradient id="paint0_radial_3213_12555" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(60.625 60) rotate(90) scale(60 60)">
                        <stop />
                        <stop offset="0.104167" />
                        <stop offset="0.5" />
                        <stop offset="0.5625" stopColor="white" />
                        <stop offset="0.609375" />
                        <stop offset="0.640625" stopColor="white" />
                        <stop offset="0.703125" />
                        <stop offset="0.75" stopColor="white" />
                        <stop offset="0.822817" />
                        <stop offset="0.822917" stopColor="white" />
                        <stop offset="0.916667" />
                        <stop offset="0.927083" stopColor="white" />
                        <stop offset="1" />
                      </radialGradient>
                    </defs>
                  </svg>
                </div>
              ))}
            </div>
          </div>

          <div className="bottom-content">
            <div className="bottom-content__wrapper">
              <div className="box-name">
                <span>
                  {boxInfo.box.name}
                </span>
              </div>

              <h1>Bienvenue !</h1>
              <p>Une chanson a été déposée dans cette boîte !</p>

              <ol>
                <li>Choisis une chanson à déposer pour la prochaine personne</li>
                <li>Découvre ainsi la chanson déposée par la personne précédente</li>
              </ol>


              <button
                className="btn-primary"
                onClick={() => setStage(1)}
              >
                <span>Commencer</span>
              </button>

            </div>

          </div>
        </Paper>
      ) : (
        <div>Loading...</div>
      )}
    </>
  );
}
