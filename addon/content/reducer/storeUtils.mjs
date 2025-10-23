/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as RTK from "@reduxjs/toolkit";
import { conversationApp } from "./reducer.mjs";
import { messageUtils } from "./messageUtils.mjs";

export let storeUtils = new (class {
  store;

  constructor() {
    this.store = RTK.configureStore({
      reducer: conversationApp,
    });
    messageUtils.store = this.store;
  }
})();
