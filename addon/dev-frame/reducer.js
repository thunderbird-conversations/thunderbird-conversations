import * as RTK from "@reduxjs/toolkit";
import { messageActions } from "../content/reducer-messages.js";
import { mockThreads } from "./mock-data/threads.js";

// Modify some actions that expect thunderbird-specific functions present.
messageActions.waitForStartup = () => async () => {};

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
