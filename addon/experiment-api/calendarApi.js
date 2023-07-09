/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon, XPCOMUtils */

XPCOMUtils.defineLazyModuleGetters(this, {
  cal: "resource:///modules/calendar/calUtils.jsm",
  call10n: "resource:///modules/calendar/utils/calL10NUtils.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

/**
 * @typedef nsIMsgDBHdr
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgHdr.idl#14
 */
/**
 * @typedef DOMWindow
 */
/**
 * @typedef calIItipItem
 */

/**
 * Get a msgHdr from a message URI (msgHdr.URI).
 *
 * @param {string} aUri The URI of the message
 * @returns {nsIMsgDBHdr}
 */
function calMsgUriToMsgHdr(aUri) {
  try {
    let messageService = MailServices.messageServiceFromURI(aUri);
    return messageService.messageURIToMsgHdr(aUri);
  } catch (e) {
    console.error("Unable to get ", aUri, " — returning null instead", e);
    return null;
  }
}

/**
 * Executes an action from a calandar message.
 *
 * @param {DOMWindow} aWindow - The current window
 * @param {string} aParticipantStatus - A partstat string as per RfC 5545
 * @param {string} aResponse - Either 'AUTO', 'NONE' or 'USER', see
 *                             calItipItem interface
 * @param {Function} aActionFunc - The function to call to do the scheduling
 *                                 operation
 * @param {calIItipItem} aItipItem - Scheduling item
 * @param {calIItipItem[]} aFoundItems - The items found when looking for the calendar item
 * @param {Function} aUpdateFunction - A function to call which will update the UI.
 * @returns {boolean} true, if the action succeeded
 */
function executeAction(
  aWindow,
  aParticipantStatus,
  aResponse,
  aActionFunc,
  aItipItem,
  aFoundItems,
  aUpdateFunction
) {
  // control to avoid processing _execAction on later user changes on the item
  let isFirstProcessing = true;

  /**
   * Internal function to trigger an scheduling operation
   *
   * @param {Function} aActionFunc - The function to call to do the
   *                                 scheduling operation
   * @param {calIItipItem} aItipItem - Scheduling item
   * @param {DOMWindow} aWindow - The current window
   * @param {string} aPartStat - partstat string as per RFC 5545
   * @param {object} aExtResponse - JS object containing at least an responseMode
   *                                property
   * @returns {boolean} true, if the action succeeded
   */
  function _execAction(
    aActionFunc,
    aItipItem,
    aWindow,
    aPartStat,
    aExtResponse
  ) {
    let method = aActionFunc.method;
    if (cal.itip.promptCalendar(aActionFunc.method, aItipItem, aWindow)) {
      if (
        method == "REQUEST" &&
        !cal.itip.promptInvitedAttendee(
          aWindow,
          aItipItem,
          Ci.calIItipItem[aResponse]
        )
      ) {
        return false;
      }

      let isDeclineCounter = aPartStat == "X-DECLINECOUNTER";
      // filter out fake partstats
      if (aPartStat.startsWith("X-")) {
        aParticipantStatus = "";
      }
      // hide the buttons now, to disable pressing them twice...
      if (aPartStat == aParticipantStatus) {
        aUpdateFunction({ resetButtons: true });
      }

      let opListener = {
        QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
        onOperationComplete(aCalendar, aStatus, aOperationType, aId, aDetail) {
          isFirstProcessing = false;
          if (Components.isSuccessCode(aStatus) && isDeclineCounter) {
            // TODO: move the DECLINECOUNTER stuff to actionFunc
            aItipItem.getItemList().forEach((aItem) => {
              // we can rely on the received itipItem to reply at this stage
              // already, the checks have been done in cal.itip.processFoundItems
              // when setting up the respective aActionFunc
              let attendees = cal.itip.getAttendeesBySender(
                aItem.getAttendees(),
                aItipItem.sender
              );
              let status = true;
              if (attendees.length == 1 && aFoundItems?.length) {
                // we must return a message with the same sequence number as the
                // counterproposal - to make it easy, we simply use the received
                // item and just remove a comment, if any
                try {
                  let item = aItem.clone();
                  item.calendar = aFoundItems[0].calendar;
                  item.deleteProperty("COMMENT");
                  // once we have full support to deal with for multiple items
                  // in a received invitation message, we should send this
                  // from outside outside of the forEach context
                  status = cal.itip.sendDeclineCounterMessage(
                    item,
                    "DECLINECOUNTER",
                    attendees,
                    {
                      value: false,
                    }
                  );
                } catch (e) {
                  cal.ERROR(e);
                  status = false;
                }
              } else {
                status = false;
              }
              if (!status) {
                cal.ERROR("Failed to send DECLINECOUNTER reply!");
              }
            });
          }
          // For now, we just state the status for the user something very simple
          let label = cal.itip.getCompleteText(aStatus, aOperationType);
          aUpdateFunction({ label });

          if (!Components.isSuccessCode(aStatus)) {
            cal.showError(label);
            return;
          }

          if (
            Services.prefs.getBoolPref("calendar.itip.newInvitationDisplay")
          ) {
            aWindow.dispatchEvent(
              new aWindow.CustomEvent("onItipItemActionFinished", {
                detail: aItipItem,
              })
            );
          }
        },
        onGetResult(calendar, status, itemType, detail, items) {},
      };

      try {
        aActionFunc(opListener, aParticipantStatus, aExtResponse);
      } catch (exc) {
        console.error(exc);
      }
      return true;
    }
    return false;
  }

  if (aParticipantStatus == null) {
    aParticipantStatus = "";
  }
  if (
    aParticipantStatus == "X-SHOWDETAILS" ||
    aParticipantStatus == "X-RESCHEDULE"
  ) {
    let counterProposal;
    if (aFoundItems?.length) {
      let item = aFoundItems[0].isMutable
        ? aFoundItems[0]
        : aFoundItems[0].clone();

      if (aParticipantStatus == "X-RESCHEDULE") {
        // TODO most of the following should be moved to the actionFunc defined in
        // calItipUtils
        let proposedItem = aItipItem.getItemList()[0];
        let proposedRID = proposedItem.getProperty("RECURRENCE-ID");
        if (proposedRID) {
          // if this is a counterproposal for a specific occurrence, we use
          // that to compare with
          item = item.recurrenceInfo.getOccurrenceFor(proposedRID).clone();
        }
        let parsedProposal = cal.invitation.parseCounter(proposedItem, item);
        let potentialProposers = cal.itip.getAttendeesBySender(
          proposedItem.getAttendees(),
          aItipItem.sender
        );
        let proposingAttendee =
          potentialProposers.length == 1 ? potentialProposers[0] : null;
        if (
          proposingAttendee &&
          ["OK", "OUTDATED", "NOTLATESTUPDATE"].includes(
            parsedProposal.result.type
          )
        ) {
          counterProposal = {
            attendee: proposingAttendee,
            proposal: parsedProposal.differences,
            oldVersion:
              parsedProposal.result == "OLDVERSION" ||
              parsedProposal.result == "NOTLATESTUPDATE",
            onReschedule: () => {
              aUpdateFunction({
                label: cal.l10n.getLtnString(
                  "imipBarCounterPreviousVersionText"
                ),
              });
              // TODO: should we hide the buttons in this case, too?
            },
          };
        } else {
          aUpdateFunction({
            label: cal.l10n.getLtnString("imipBarCounterErrorText"),
            resetButtons: true,
          });
          if (proposingAttendee) {
            cal.LOG(parsedProposal.result.descr);
          } else {
            cal.LOG(
              "Failed to identify the sending attendee of the counterproposal."
            );
          }

          return false;
        }
      }
      // if this a rescheduling operation, we suppress the occurrence
      // prompt here
      aWindow.modifyEventWithDialog(
        item,
        aParticipantStatus != "X-RESCHEDULE",
        null,
        counterProposal
      );
    }
  } else {
    let response;
    if (aResponse) {
      if (aResponse == "AUTO" || aResponse == "NONE" || aResponse == "USER") {
        response = { responseMode: Ci.calIItipItem[aResponse] };
      }
      // Open an extended response dialog to enable the user to add a comment, make a
      // counterproposal, delegate the event or interact in another way.
      // Instead of a dialog, this might be implemented as a separate container inside the
      // imip-overlay as proposed in bug 458578
    }
    let delmgr = Cc["@mozilla.org/calendar/deleted-items-manager;1"].getService(
      Ci.calIDeletedItems
    );
    let items = aItipItem.getItemList();
    if (items && items.length) {
      let delTime = delmgr.getDeletedDate(items[0].id);
      let dialogText = cal.l10n.getLtnString("confirmProcessInvitation");
      let dialogTitle = cal.l10n.getLtnString("confirmProcessInvitationTitle");
      if (
        delTime &&
        !Services.prompt.confirm(aWindow, dialogTitle, dialogText)
      ) {
        return false;
      }
    }

    if (aParticipantStatus == "X-SAVECOPY") {
      // we create and adopt copies of the respective events
      let saveitems = aItipItem
        .getItemList()
        .map(cal.itip.getPublishLikeItemCopy.bind(cal));
      if (saveitems.length) {
        let methods = { receivedMethod: "PUBLISH", responseMethod: "PUBLISH" };
        let newItipItem = cal.itip.getModifiedItipItem(
          aItipItem,
          saveitems,
          methods
        );
        // setup callback and trigger re-processing
        let storeCopy = function (aItipItem, aRc, aActionFunc, aFoundItems) {
          if (
            isFirstProcessing &&
            aActionFunc &&
            Components.isSuccessCode(aRc)
          ) {
            _execAction(aActionFunc, aItipItem, aWindow, aParticipantStatus);
          }
        };
        cal.itip.processItipItem(newItipItem, storeCopy);
      }
      // we stop here to not process the original item
      return false;
    }
    return _execAction(
      aActionFunc,
      aItipItem,
      aWindow,
      aParticipantStatus,
      response
    );
  }
  return false;
}

/**
 * Open (or focus if already open) the calendar tab, even if the imip bar is
 * in a message window, and even if there is no main three pane Thunderbird
 * window open. Called when clicking the imip bar's calendar button.
 * Copied from Thunderbird until bug nnnnnn lands.
 */
function goToCalendar() {
  let openCal = (mainWindow) => {
    mainWindow.focus();
    mainWindow.document.getElementById("tabmail").openTab("calendar");
  };

  let mainWindow = Services.wm.getMostRecentWindow("mail:3pane");

  if (mainWindow) {
    openCal(mainWindow);
  } else {
    mainWindow = Services.ww.openWindow(
      null,
      "chrome://messenger/content/messenger.xhtml",
      "_blank",
      "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
      null
    );

    // Wait until calendar is set up in the new window.
    let calStartupObserver = {
      observe(subject, topic, data) {
        openCal(mainWindow);
        Services.obs.removeObserver(
          calStartupObserver,
          "calendar-startup-done"
        );
      },
    };
    Services.obs.addObserver(calStartupObserver, "calendar-startup-done");
  }
}

let extensionContext;
let inviteListeners = new Set();
let msgIdToActionMap = new Map();

let msgHeaderSink = {
  QueryInterface: ChromeUtils.generateQI([
    "nsIWebProgressListener",
    "nsISupportsWeakReference",
  ]),

  onStateChange(webProgress, request, stateFlags) {
    if (!(request instanceof Ci.nsIMailChannel) || !request.imipItem) {
      return;
    }

    let msgHdr = calMsgUriToMsgHdr(
      webProgress.browsingContext.embedderElement.getAttribute("uri")
    );
    cal.itip.initItemFromMsgData(request.imipItem, request.imipMethod, msgHdr);

    cal.itip.processItipItem(
      request.imipItem,
      (itipItem, rc, actionFunc, foundItems) => {
        let data = cal.itip.getOptionsText(
          itipItem,
          rc,
          actionFunc,
          foundItems
        );
        // if (!Components.isSuccessCode(rc)) {
        //   return;
        // }
        // We need this to determine whether this is an outgoing or incoming message because
        // Thunderbird doesn't provide a distinct flag on message level to do so. Relying on
        // folder flags only may lead to false positives.
        let isOutgoing = false;
        if (msgHdr) {
          let author = msgHdr.mime2DecodedAuthor;
          let isSentFolder =
            msgHdr.folder && msgHdr.folder.flags & Ci.nsMsgFolderFlags.SentMail;
          if (author && isSentFolder) {
            for (let identity of MailServices.accounts.allIdentities) {
              if (
                author.includes(identity.email) &&
                !identity.fccReplyFollowsParent
              ) {
                isOutgoing = true;
              }
            }
          }
        }

        // We override the bar label for sent out invitations and in case the event does not exist
        // anymore, we also clear the buttons if any to avoid e.g. accept/decline buttons
        if (isOutgoing) {
          if (foundItems && foundItems[0]) {
            data.label = call10n.getLtnString("imipBarSentText");
          } else {
            data = {
              label: call10n.getLtnString("imipBarSentButRemovedText"),
              buttons: [],
              hideMenuItems: [],
              hideItems: [],
              showItems: [],
            };
          }
        }

        if (!itipItem) {
          return;
        }

        let msgId =
          extensionContext.extension.messageManager.convert(msgHdr).id;

        const idToArgumentsMap = {
          imipAcceptButton: ["ACCEPTED", "AUTO"],
          imipAcceptRecurrencesButton: ["ACCEPTED", "AUTO"],
          imipTentativeButton: ["TENTATIVE", "AUTO"],
          imipTentativeRecurrencesButton: ["TENTATIVE", "AUTO"],
          imipDeclineButton: ["DECLINED", "AUTO"],
          imipDeclineRecurrencesButton: ["DECLINED", "AUTO"],
          // Note: not an official action, used to open calendar instead.
          imipGoToCalendarButton: ["GOTO"],
          imipDetailsButton: ["X-SHOWDETAILS"],
          imipDeclineCounterButton: ["X-DECLINECOUNTER"],
          imipRescheduleButton: ["X-RESCHEDULE"],
        };

        const buttons = [];

        let addButton = function (c) {
          if (buttons.find((b) => b.id == c)) {
            return;
          }
          // let originalButtonElement = win.document.getElementById(c);
          buttons.push({
            id: c,
            actionParams: {
              extraData: {
                execute: idToArgumentsMap[c] ?? [],
              },
            },
            classNames: `imip-button calendarImipButton msgHeaderView-button ${c}`,
          });
        };

        data.showItems.filter((c) => c != "imipMoreButton").map(addButton);

        msgIdToActionMap.set(msgId, { actionFunc, itipItem, foundItems });

        for (let listener of inviteListeners) {
          listener.async({
            msgId,
            notification: {
              buttons,
              iconName: "calendar_today",
              type: "calendar",
              label: data.label,
            },
          });
        }
      }
    );
  },
  onStartHeaders() {},
  onEndHeaders() {},
  processHeaders() {},
  handleAttachment() {},
  addAttachmentField() {},
  onEndAllAttachments() {},
  onEndMsgDownload() {},
  onEndMsgHeaders() {},
};

/* exported convCalendar */
var convCalendar = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      convCalendar: {
        onMessageNotification(winId, tabId, msgId, action) {
          if (action[0] == "GOTO") {
            goToCalendar();
            return;
          }
          let win;
          if (winId) {
            win = Services.wm.getOuterWindowWithId(winId);
          } else {
            let tabObject = context.extension.tabManager.get(tabId);
            win = Cu.getGlobalForObject(tabObject.nativeTab);
          }
          if (!win.modifyEventWithDialog) {
            win = Services.wm.getMostRecentWindow("mail:3pane");
          }
          let details = msgIdToActionMap.get(msgId);
          executeAction(
            win,
            action?.[0] ?? undefined,
            action?.[1] ?? undefined,
            details.actionFunc,
            details.itipItem,
            details.foundItems,
            (updates) => {
              // TODO: We should probably update the label here, but it doesn't
              // seem too vital.
              console.log(updates);
            }
          );
        },
        messageUnloaded(winId, tabId, msgId) {
          if (msgIdToActionMap.has(msgId)) {
            msgIdToActionMap.delete(msgId);
          }
        },
        onListenForInvites: new ExtensionCommon.EventManager({
          context,
          name: "convCalendar.onListenForInvites",
          register(fire, winId, tabId) {
            let msgBrowser;
            if (winId) {
              let win = Services.wm.getOuterWindowWithId(winId);
              msgBrowser = win.document.getElementById("multiMessageBrowser");
            } else {
              let tabObject = context.extension.tabManager.get(tabId);
              if (tabObject.nativeTab.mode.type == "contentTab") {
                msgBrowser = tabObject.browser;
              } else {
                msgBrowser =
                  tabObject.nativeTab.chromeBrowser.contentWindow
                    .multiMessageBrowser;
              }
            }
            inviteListeners.add(fire);
            extensionContext = context;
            msgBrowser.addProgressListener(
              msgHeaderSink,
              Ci.nsIWebProgress.NOTIFY_STATE_NETWORK |
                Ci.nsIWebProgress.NOTIFY_STATE_WINDOW |
                Ci.nsIWebProgress.NOTIFY_STATUS
            );
            return function () {
              inviteListeners.delete(fire);
              msgBrowser.removeProgressListener(
                msgHeaderSink,
                Ci.nsIWebProgress.NOTIFY_STATE_NETWORK |
                  Ci.nsIWebProgress.NOTIFY_STATE_WINDOW |
                  Ci.nsIWebProgress.NOTIFY_STATUS
              );
            };
          },
        }).api(),
      },
    };
  }
};
