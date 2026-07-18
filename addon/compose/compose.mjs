/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const platformInfo = await browser.runtime.getPlatformInfo();
// TODO: Maybe should handle the tweak chrome option here.
window.document.body.parentElement.setAttribute("os", platformInfo.os);

let params = new URLSearchParams(document.location.search);

let identityId = params.get("identityId");
let identityDetail;
if (identityId) {
  identityDetail = await browser.identities.get(identityId);
} else {
  let defaultAccount = await browser.accounts.getDefault();
  identityDetail = await browser.identities.getDefault(defaultAccount.id);
}

let composeWidget = document.querySelector("compose-widget");

composeWidget.setAttribute("from", identityDetail.email);
composeWidget.setAttribute("identityId", identityDetail.id);
