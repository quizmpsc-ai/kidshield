const SecurityManager = {
  initializeSecurity: async (role) => {
    return { rootDetection: { isRooted: false } };
  },
};
export default SecurityManager;