var EXPORTED_SYMBOLS = ["setupLogging", "logRoot"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Prefs: "chrome://conversations/content/modules/prefs.js",
});

XPCOMUtils.defineLazyGetter(this, "Log4Moz", () => {
  let tmp = {};
  try {
    ChromeUtils.import("resource:///modules/gloda/log4moz.js", tmp);
  } catch (ex) {
    ChromeUtils.import("resource:///modules/gloda/Log4moz.jsm", tmp);
  }
  return tmp.Log4Moz;
});

let logRoot = "Conversations";
let rootLogger;

function setupLogging(name) {
  if (!rootLogger) {
    let formatter = new Log4Moz.BasicFormatter();

    rootLogger = Log4Moz.repository.getLogger(logRoot);

    // Loggers are hierarchical, lowering this log level will affect all output
    let root = rootLogger;
    root.level = Log4Moz.Level.All;

    if (Prefs.logging_enabled) {
      // A console appender outputs to the JS Error Console
      let capp = new Log4Moz.ConsoleAppender(formatter);
      capp.level = Log4Moz.Level.All;
      root.addAppender(capp);

      // A dump appender outputs to standard out
      let dapp = new Log4Moz.DumpAppender(formatter);
      dapp.level = Log4Moz.Level.All;
      root.addAppender(dapp);
    }

    rootLogger.debug("Logging enabled");
  }
  let Log = Log4Moz.repository.getLogger(name);

  Log.assert = function(aBool, aStr) {
    if (!aBool) {
      console.error(
        "\n!!!!!!!!!!!!!!!!!!!!!!" +
          "\n    ASSERT FAILURE    " +
          "\n!!!!!!!!!!!!!!!!!!!!!!\n" +
          aStr
      );
      throw Error("Assert failures are fatal, man");
    }
  };

  return Log;
}
