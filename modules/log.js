var EXPORTED_SYMBOLS = ["setupLogging", "dumpCallStack", "logRoot"]

Components.utils.import("resource:///modules/gloda/log4moz.js");

function setupLogging(name) {
  let Log = Log4Moz.repository.getLogger(name);

  Log.assert = function (aBool, aStr) {
    if (!aBool) {
      this.error("\n!!!!!!!!!!!!!!!!!!!!!!"+
                 "\n    ASSERT FAILURE    "+
                 "\n!!!!!!!!!!!!!!!!!!!!!!\n"+aStr);
      throw Error("Assert failures are fatal, man");
    }
  };

  return Log;
}

function setupFullLogging(name) {
  dump(name+"\n\n");
  // The basic formatter will output lines like:
  // DATE/TIME	LoggerName	LEVEL	(log message) 
  let formatter = new Log4Moz.BasicFormatter();

  let Log = Log4Moz.repository.getLogger(name);

  // Loggers are hierarchical, lowering this log level will affect all output
  let root = Log;
  root.level = Log4Moz.Level["All"];

  // A console appender outputs to the JS Error Console
  let capp = new Log4Moz.ConsoleAppender(formatter);
  capp.level = Log4Moz.Level["Warn"];
  root.addAppender(capp);

  // A dump appender outputs to standard out
  let dapp = new Log4Moz.DumpAppender(formatter);
  dapp.level = Log4Moz.Level["All"];
  root.addAppender(dapp);

  Log.assert = function (aBool, aStr) {
    if (!aBool) {
      this.error("\n!!!!!!!!!!!!!!!!!!!!!!"+
                 "\n    ASSERT FAILURE    "+
                 "\n!!!!!!!!!!!!!!!!!!!!!!\n"+aStr);
      throw Error("Assert failures are fatal, man");
    }
  };

  Log.debug("Logging enabled");

  return Log;
}

// Must call this once to setup the root logger
let logRoot = "Conversations";
let MyLog = setupFullLogging(logRoot);

function dumpCallStack(e) {
  let frame = e ? e.stack : Components.stack;
  while (frame) {
    MyLog.debug("\n"+frame);
    frame = frame.caller;
  }
};
