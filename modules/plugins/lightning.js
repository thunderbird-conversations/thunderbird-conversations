/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Calendar code.
 *
 * The Initial Developer of the Original Code is
 *   Philipp Kewisch <mozilla@kewis.ch>
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = [];

Components.utils.import("resource://conversations/modules/hook.js");
Components.utils.import("resource://conversations/modules/log.js");
Components.utils.import("resource:///modules/Services.jsm");

let Log = setupLogging("Conversations.Modules.Lightning");

let hasLightning = false;
try {
  Components.utils.import("resource://calendar/modules/calItipUtils.jsm");
  if (cal.itip.getMethodText) {
    // We need the patch from mozilla bug 626829 for this plugin to work. The
    // patch adds the method cal.itip.getMethodText.
    hasLightning = true;
  } else {
    Log.debug("Not loading Lightning plugin, you need a newer version of Lightning!");
  }
} catch (e) {
  Log.debug("Did you know, Thunderbird Conversations supports Lightning?");
}

function imipAccept(rootNode, msgWindow, itipItem, actionFunc, actionMethod, foundItems) {
  if (actionMethod == "X-SHOWDETAILS") {
    if (foundItems.length) {
      let item = foundItems[0].isMutable ? foundItems[0] : foundItems[0].clone();
      msgWindow.domWindow.modifyEventWithDialog(item);
    }
  } else if (cal.itip.promptCalendar(actionFunc.method, itipItem, msgWindow.domWindow)) {
    // Hide the buttons so processing doesn't happen twice
    for (i = 1; i <= 3; i++) {
      let buttonElement = rootNode.getElementsByClassName("lightningImipButton" + i)[0];
      buttonElement.style.display = "none";
      buttonElement.removeEventListener("click", buttonElement.clickHandler, false);
      buttonElement.clickHandler = null;
    }

    let listener = {
      onOperationComplete: function imipAccept_onOpComplete(aCalendar,
                                                            aStatus,
                                                            aOperationType,
                                                            aId,
                                                            aDetail) {

        let imipBarText = rootNode.getElementsByClassName("lightningImipText")[0];
        let label = cal.itip.getCompleteText(aStatus, aOperationType);
        imipBarText.textContent = label;
      },

      onGetResult: function() {}
    };

    try {
      actionFunc(listener, actionMethod);
    } catch (e) {
      Log.error(e);
    }
    return true;
  } else {
    return false;
  }
}

function imipOptions(rootNode, msgWindow, itipItem, rc, actionFunc, foundItems) {
  let imipBarText = rootNode.getElementsByClassName("lightningImipText")[0];
  let doc = imipBarText.ownerDocument;
  let data = cal.itip.getOptionsText(itipItem, rc, actionFunc);

  imipBarText.textContent = data.label;
  for (let i = 1; i <= 3; i++) {
      let buttonElement = rootNode.getElementsByClassName("lightningImipButton" + i)[0];
      if (data["button" + i].label) {
          let handler = imipAccept.bind(null, rootNode, msgWindow, itipItem,
                                        actionFunc, data["button" + i].actionMethod,
                                        foundItems);
          buttonElement.textContent = data["button" + i].label;

          // TODO The "command" handler would be better for accessibility, but 
          // it doesn't seem to work with this type of button.
          buttonElement.addEventListener("click", handler, false);
          buttonElement.style.display = "block";
          buttonElement.clickHandler = handler;
      }
  }
}

let lightningHook = {
  onMessageStreamed: function _lightningHook_onMessageStreamed(aMsgHdr, aDomNode, aMsgWindow) {
    let imipBar = aDomNode.getElementsByClassName("lightningImipBar")[0];
    let imipBarText = aDomNode.getElementsByClassName("lightningImipText")[0];
    let doc = imipBar.ownerDocument;

    let itipItem = null;
    try {
      let sinkProps = aMsgWindow.msgHeaderSink.properties;
      itipItem = sinkProps.getPropertyAsInterface("itipItem", Components.interfaces.calIItipItem);
    } catch (e) {
    }

    if (itipItem) {
      let method = aMsgHdr.getStringProperty("imip_method");
      let label = cal.itip.getMethodText(method);
      cal.itip.initItemFromMsgData(itipItem, method, aMsgHdr);

      imipBarText.textContent  = label;

      cal.itip.processItipItem(itipItem, imipOptions.bind(null, aDomNode, aMsgWindow));
      imipBar.style.display = "block";
    }
  }
};

if (hasLightning) {
  registerHook(lightningHook);
  Log.debug("Lightning plugin for Thunderbird Conversations loaded!");
}
