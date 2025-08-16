import * as React from "react";
import { Link } from "react-router-dom";
import { useContext } from "react";
import { UserContext } from "./UserContext";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Avatar from "@mui/material/Avatar";
import PersonIcon from "@mui/icons-material/Person";
import Button from "@mui/material/Button";
import AlbumIcon from "@mui/icons-material/Album";

export default function MenuAppBar() {
  // States & Variables
  const { user, setUser, isAuthenticated, setIsAuthenticated } =
    useContext(UserContext);

  return (
    <AppBar position="static" sx={{ backgroundColor: "white" }}>
      <Toolbar>
        <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
          <Typography
            variant="h6"
            component="div"
            sx={{
              backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            La Boîte à Groove
          </Typography>
        </Box>
        {isAuthenticated ? (
          <>
            <Box
              sx={{
                display: "flex",
                marginRight: "5%",
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Typography
                variant="body1"
                component="div"
                sx={{
                  color: "black",
                }}
              >
                {user.points}
              </Typography>
              <AlbumIcon
                sx={{
                  color: "#fa4000",
                }}
              />
            </Box>
            <IconButton
              size="large"
              aria-label="account of current user"
              aria-controls="menu-appbar"
              color="inherit"
              component={Link}
              to="/profile"
            >
              <Avatar alt={user.username} src={user.profile_picture} />
            </IconButton>
          </>
        ) : (
          <Button
            variant="outlined"
            endIcon={<PersonIcon />}
            component={Link}
            to="/login"
            sx={{
              borderRadius: "20px",
              backgroundColor: "white",
              color: "orange",
              border: "none",
              textTransform: "none",
              "&:hover": {
                border: "none",
              },
            }}
          >
            Me connecter
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}
