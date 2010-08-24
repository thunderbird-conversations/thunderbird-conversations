var EXPORTED_SYMBOLS = ["setupLogging", "dumpCallStack"]

Components.utils.import("resource:///modules/gloda/log4moz.js");

let Log;

function setupLogging() {
  if (!Log) {
    // The basic formatter will output lines like:
    // DATE/TIME	LoggerName	LEVEL	(log message) 
    let formatter = new Log4Moz.BasicFormatter();

    // Loggers are hierarchical, lowering this log level will affect all output
    let root = Log4Moz.repository.rootLogger;
    root.level = Log4Moz.Level["All"];

    // A console appender outputs to the JS Error Console
    let capp = new Log4Moz.ConsoleAppender(formatter);
    capp.level = Log4Moz.Level["Warn"];
    root.addAppender(capp);

    // A dump appender outputs to standard out
    let dapp = new Log4Moz.DumpAppender(formatter);
    dapp.level = Log4Moz.Level["All"];
    root.addAppender(dapp);

    Log = Log4Moz.repository.getLogger("MyExtension.MyClass");
    Log.level = Log4Moz.Level["Debug"];
    Log.debug("Logging enabled");

    Log.assert = function (aBool, aStr) {
      if (!aBool)
        this.error(aStr);
    };
  }
  return Log;
}

function dumpCallStack(e) {
  setupLogging();

  let frame = e ? e.stack : Components.stack;
  while (frame) {
    Log.debug("\n"+frame);
    frame = frame.caller;
  }
};
