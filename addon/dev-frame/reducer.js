import * as RTK from "@reduxjs/toolkit";
import { attachmentActions } from "../content/reducer/reducer-attachments.js";
import { messageActions } from "../content/reducer/reducer-messages.js";
import { summaryActions } from "../content/reducer/reducer-summary.js";
import { mockThreads } from "./mock-data/threads.js";

/**
 * Make function access to attributes of `obj` logged.
 * `logFunc` will be passed the name of the method as the first
 * argument and the arguments to the method as the second.
 *
 * This will mutate `obj`!
 *
 * @param {*} obj
 * @param {*} [logFunc=() => {}]
 */
function makeAttrsLogging(obj, logFunc = () => {}) {
  for (const prop in obj) {
    if (typeof obj[prop] === "function") {
      const backupName = `_${prop}`;
      obj[backupName] = obj[prop];
      obj[prop] = (...args) => {
        logFunc(prop, args);
        return obj[backupName](...args);
      };
    }
  }
}

/**
 * Creates a logging function for use with `makeAttrsLogging`.
 * Logging is formatted as `${namespace}.${attr_name} ...`
 *
 * @param {*} namespace
 * @returns
 */
function createThunkLogger(namespace) {
  return (name, args) => {
    const argsWithCommas = [];
    for (let i = 0; i < args.length; i++) {
      argsWithCommas.push(args[i]);
      if (i < args.length - 1) {
        argsWithCommas.push(",");
      }
    }
    console.log(
      "%cThunk Called:",
      "color: #22f; font-weight: bold;",
      `${namespace}.${name}(`,
      ...argsWithCommas,
      ")"
    );
  };
}

// Modify some actions that expect thunderbird-specific functions present.
messageActions.waitForStartup = () => async () => {};

// We'd like to log all the `thunks` we execute, so wrap all method access in
// logger functions.
makeAttrsLogging(messageActions, createThunkLogger("messageActions"));
makeAttrsLogging(summaryActions, createThunkLogger("summaryActions"));
makeAttrsLogging(attachmentActions, createThunkLogger("attachmentActions"));

export const devframeSlice = RTK.createSlice({
  name: "testing",
  initialState: {
    summary: {
      browserForegroundColor: "#000000",
      browserBackgroundColor: "#FFFFFF",
      conversation: {},
      defaultFontSize: 16,
      hasBuiltInPdf: false,
      hasIdentityParamsForCompose: true,
      hideQuickReply: false,
      iframesLoading: 0,
      isInTab: false,
      loading: false,
      OS: "linux",
      tabId: 1,
      tenPxFactor: 0.625,
      subject: "(Click a message to get started)",
      windowId: 3,
      defaultDetailsShowing: false,
      prefs: {
        hideSigs: false,
        hideQuoteLength: 5,
        tweakBodies: true,
        tweakChrome: true,
      },
      autoMarkAsRead: false,
    },
    messages: { msgData: [] },
    threads: {
      selectedThread: 0,
      threadData: mockThreads,
    },
  },
  reducers: {
    setActiveThread(state, { payload }) {
      const { thread, message } = payload;
      state.threads.selectedThread = thread;
      state.messages.msgData = state.threads.threadData[thread];
      state.messages.msgData[message].expanded = true;
      const messageData = state.messages.msgData[message];
      state.summary.subject = messageData.subject;
    },
  },
});
export const store = RTK.configureStore({ reducer: devframeSlice.reducer });
