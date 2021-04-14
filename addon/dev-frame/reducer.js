import * as RTK from "@reduxjs/toolkit";
import { attachmentActions } from "../content/reducer/reducer-attachments.js";
import {
  initialCompose,
  composeActions,
} from "../content/reducer/reducer-compose.js";
import {
  initialMessages,
  messageActions,
} from "../content/reducer/reducer-messages.js";
import {
  initialSummary,
  summaryActions,
} from "../content/reducer/reducer-summary.js";
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
makeAttrsLogging(composeActions, createThunkLogger("composeActions"));
makeAttrsLogging(messageActions, createThunkLogger("messageActions"));
makeAttrsLogging(summaryActions, createThunkLogger("summaryActions"));
makeAttrsLogging(attachmentActions, createThunkLogger("attachmentActions"));

export const devframeSlice = RTK.createSlice({
  name: "testing",
  initialState: {
    compose: { ...initialCompose },
    summary: { ...initialSummary },
    messages: { ...initialMessages },
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
