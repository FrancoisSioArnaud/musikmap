import React from "react";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";

/**
 * Copyright Component
 * Renders a copyright statement with a link to the "La boite à son" website
 * and the current year.
 * @param {object} props - Additional properties to be spread onto the Typography component
 * @returns {React.Element} - A Typography component displaying the copyright statement
 */
export function Footer(props) {
  return (
    <Typography
      variant="body2"
      color="text.secondary"
      align="center"
      {...props}
    >
      {"Copyright © "}
      <Link color="inherit" href="/">
        MusikMap
      </Link>{" "}
      {new Date().getFullYear()}
      {"."}
    </Typography>
  );
}

