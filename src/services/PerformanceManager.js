const PerformanceManager = {
  createSubscriptionManager: () => ({
    add: (unsub) => {},
    cleanup: () => {},
  }),
  runAfterInteractions: (fn) => setTimeout(fn, 100),
};
export default PerformanceManager;