import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import React from "react";
import SearchPanel from "../Common/Search/SearchPanel";

export default function DepositSearchSection({open,onOpen,onClose,onSelectSong,depositFlowState,searchIncitationText}) {
  return <Box sx={{ px: 2, py: 2 }}>
    <Typography variant="h3" sx={{ mb: 2 }}>Dépose une chanson pour gagner des points et révéler plus de chansons</Typography>
    <SearchPanel collapsed onCollapsedClick={onOpen} collapsedPlaceholder="Déposer une chanson" />
    <Drawer anchor="bottom" open={open} onClose={onClose} PaperProps={{ sx: { height: "100dvh" } }}>
      <Box sx={{ height: "100%" }}>
        {depositFlowState?.status === "error" && depositFlowState?.errorMessage ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {depositFlowState.errorMessage}
          </Alert>
        ) : null}
        <SearchPanel
          onSelectSong={onSelectSong}
          depositFlowState={depositFlowState}
          actionLabel="Déposer"
          searchIncitationText={searchIncitationText}
          placeholder="Cherche une chanson à déposer"
          rootSx={{ flex: 1 }}
        />
      </Box>
    </Drawer>
  </Box>;
}
