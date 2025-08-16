import React, { useState, useEffect, useContext } from "react";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import LoaderLogo from '../../../assets/images/loader.svg';

export default function Loader({ setStage, boxInfo, className }) {
  return (
    <>
      <div id="loader">
        <img src={LoaderLogo} alt="" />
      </div>
    </>
  );
}
