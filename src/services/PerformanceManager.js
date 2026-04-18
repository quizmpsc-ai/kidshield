import { InteractionManager, AppState } from "react-native";

const PerformanceManager = {
  initialize: () => { console.log("PerformanceManager initialized"); },
  runAfterInteractions: (task) => InteractionManager.runAfterInteractions(task),
};

export default PerformanceManager;