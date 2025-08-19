import React, { useState, useEffect, useContext } from "react";
import Box from "@mui/material/Box";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { getUserDetails } from "./UsersUtils";
import { Typography } from "@mui/material";
import Avatar from "@mui/material/Avatar";

export default function UserPublicProfile() {
  // States & Variables
  const navigate = useNavigate();

  // Gets userID from URL
  const { userID } = useParams();

  // Stores all the information about the user
  const [userInfo, setUserInfo] = useState({});

  /**
   * Runs the specified callback function after the component has rendered.
   */
  useEffect(() => {
    getUserDetails(userID)
      .then((data) => {
        if (data) {
          setUserInfo(data);
          // console.log(data);
        } else {
          navigate("/");
        }
      })
      .catch((error) => {
        console.error(error);
        navigate("/");
      });
  }, []);

  return (
    <>
      <Box sx={{ padding: "16px" }}>
        {userInfo ? (
          <>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "left",
                gap: "10px",
              }}
            >
              <Box
                sx={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "left",
                  gap: "10px",
                }}
              >
                <Typography
                  variant="h4"
                  sx={{
                    letterSpacing: "0.3rem",
                    textTransform: "uppercase",
                  }}
                >
                  {userInfo.username}
                </Typography>
                <Avatar
                  src={userInfo.profile_picture}
                  alt={userInfo.username}
                  sx={{
                    width: "40px",
                    height: "40px",
                  }}
                />
              </Box>

              <Typography variant="subtitle2">
                {userInfo.total_deposits +
                  " autres pépites partagées par cet utilisateur"}
              </Typography>
            </Box>
          </>
        ) : (
          <Typography variant="h1">Loading...</Typography>
        )}
      </Box>
    </>
  );
}

