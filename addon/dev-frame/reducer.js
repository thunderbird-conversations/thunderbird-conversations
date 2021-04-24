import * as RTK from "@reduxjs/toolkit";
import * as Redux from "redux";
import { attachmentActions } from "../content/reducer/reducer-attachments.js";
import {
  composeSlice,
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
import {
  quickReplyActions,
  quickReplySlice,
} from "../content/reducer/reducer-quickReply.js";
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
makeAttrsLogging(quickReplyActions, createThunkLogger("quickReplyActions"));

export const fakeSummarySlice = RTK.createSlice({
  name: "summary",
  initialState: initialSummary,
  reducers: {
    replaceSummaryDetails(state, { payload }) {
      if (payload) {
        return { ...state, ...payload };
      }
      return state;
    },
  },
});
export const fakeMessagesSlice = RTK.createSlice({
  name: "messages",
  initialState: initialMessages,
  reducers: {
    replaceConversationDetails(state, { payload }) {
      const { messages } = payload;
      return { ...state, ...messages };
    },
  },
});

export const devFrameActions = {
  setActiveThread({ thread, message }) {
    return async (dispatch, getState) => {
      let messages = [...getState().threads.threadData[thread]];
      messages[message] = { ...messages[message] };
      messages[message].expanded = true;
      await dispatch(
        fakeSummarySlice.actions.replaceSummaryDetails({
          subject: messages[message].subject,
        })
      );
      await dispatch(
        fakeMessagesSlice.actions.replaceConversationDetails({
          messages: {
            msgData: messages,
          },
        })
      );
    };
  },
};

export const devframeSlice = RTK.createSlice({
  name: "threads",
  initialState: {
    threadData: mockThreads,
  },
  reducers: {},
});

export const devFrameApp = Redux.combineReducers({
  compose: composeSlice.reducer,
  summary: fakeSummarySlice.reducer,
  messages: fakeMessagesSlice.reducer,
  threads: devframeSlice.reducer,
  quickReply: quickReplySlice.reducer,
});
export const store = RTK.configureStore({ reducer: devFrameApp });
