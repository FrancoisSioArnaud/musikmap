import { createContext } from "react";

export const FlowboxSessionContext = createContext({
  boxesBySlug: {},
  currentFlowboxSlug: null,
  lastVisitedFlowboxSlug: null,
  sessionLoadStateBySlug: {},
  uiHintsBySlug: {},
  saveBoxBootstrap: () => {},
  markFlowboxVisited: () => {},
  clearCurrentFlowboxSlug: () => {},
  saveVerifiedSession: () => {},
  saveDiscoverSnapshot: () => {},
  clearDiscoverSnapshot: () => {},
  clearBoxSession: () => {},
  expireBoxSession: () => {},
  getBoxRuntime: () => null,
  getDiscoverSnapshot: () => null,
  getActiveSessionForSlug: () => null,
  ensureBoxSession: async () => ({ active: false }),
  consumeEnterHint: () => {},
  markThreeMinWarningShown: () => {},
});
