var EXPORTED_SYMBOLS = ["Config"];

var Config = {
  get BOOTSTRAP_REASONS() {
    return {
      APP_STARTUP: 1,
      APP_SHUTDOWN: 2,
      ADDON_ENABLE: 3,
      ADDON_DISABLE: 4,
      ADDON_INSTALL: 5,
      ADDON_UNINSTALL: 6,
      ADDON_UPGRADE: 7,
      ADDON_DOWNGRADE: 8,
    };
  },
};
