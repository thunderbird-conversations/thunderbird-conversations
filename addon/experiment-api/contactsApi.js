/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global ExtensionCommon, XPCOMUtils, Services */

XPCOMUtils.defineLazyModuleGetters(this, {
  Gloda: "resource:///modules/gloda/Gloda.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

/**
 * @typedef nsIMsgFolder
 * @see https://searchfox.org/comm-central/rev/9d9fac50cddfd9606a51c4ec3059728c33d58028/mailnews/base/public/nsIMsgFolder.idl
 */

/**
 * Creates a Gloda query object
 *
 * @param {object} [options]
 * @returns {object}
 */
function getQuery(
  options = {
    kind: "email",
    value: null,
    query: "NOUN_IDENTITY",
    involvesItems: null,
  }
) {
  const q = Gloda.newQuery(Gloda[options.query]);
  if (options.kind != null) {
    q.kind(options.kind);
  }
  if (options.value != null) {
    q.value(options.value);
  }
  if (options.involvesItems != null) {
    q.involves.apply(q, options.involvesItems);
  }
  return q;
}

/**
 * Runs a Gloda query and returns a promise.
 *
 * @param {object} [options]
 */
async function glodaQuery(
  options = {
    kind: "email",
    value: null,
    query: "NOUN_IDENTITY",
    involvesItems: null,
  }
) {
  const q = getQuery(options);
  return new Promise((resolve, reject) => {
    q.getCollection({
      onItemsAdded(aItems, aCollection) {},
      onItemsModified(aItems, aCollection) {},
      onItemsRemoved(aItems, aCollection) {},
      onQueryCompleted(aCollection) {
        resolve(aCollection);
      },
    });
  });
}

function getWindowFromId(windowManager, context, id) {
  return id !== null && id !== undefined
    ? windowManager.get(id, context).window
    : Services.wm.getMostRecentWindow("mail:3pane");
}

/* exported convContacts */
var convContacts = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { windowManager, addressBookManager } = extension;
    return {
      convContacts: {
        async beginNew(beginNewProperties) {
          const window = getWindowFromId(
            windowManager,
            context,
            beginNewProperties.windowId
          );

          window.toAddressBook({
            action: "create",
            vCard: `BEGIN:VCARD\r\nFN:${beginNewProperties.displayName}\r\nEMAIL:${beginNewProperties.email}\r\nEND:VCARD\r\n`,
          });
        },
        async beginEdit(beginEditProperties) {
          const window = getWindowFromId(
            windowManager,
            context,
            beginEditProperties.windowId
          );
          let contact = addressBookManager.findContactById(
            beginEditProperties.contactId
          );
          if (!contact) {
            console.error("Could not find contact to load");
            return;
          }

          window.toAddressBook({
            action: "edit",
            card: contact.item,
          });
        },
        async showMessagesInvolving(options) {
          const window = getWindowFromId(
            windowManager,
            context,
            options.windowId
          );

          const collection = await glodaQuery({
            kind: "email",
            value: options.email,
            query: "NOUN_IDENTITY",
          });
          if (!collection.items.length) {
            return;
          }

          const query = getQuery({
            query: "NOUN_MESSAGE",
            involvesItems: collection.items,
          });

          let tabmail = window.document.getElementById("tabmail");
          tabmail.openTab("glodaList", {
            query,
            title: options.title,
            background: false,
          });
        },
        async makeMimeAddress(options) {
          const { name, email } = options;
          return !name || name == email
            ? email
            : MailServices.headerParser.makeMimeAddress(name, email);
        },
        onColumnHandler: new ExtensionCommon.EventManager({
          context,
          name: "convContacts.onColumnHandler",
          register(
            fire,
            columnName,
            columnTooltip,
            betweenMeAndSomeone,
            betweenSomeoneAndMe,
            commaSeparator,
            andSeparator
          ) {
            let callback = createColumn.bind(null, columnName, columnTooltip);
            const windowObserver = new WindowObserverContacts(
              windowManager,
              callback
            );
            monkeyPatchAllWindows(windowManager, callback);
            Services.ww.registerNotification(windowObserver);

            const emails = getIdentityEmails();
            let callback2 = registerColumn.bind(
              null,
              emails,
              betweenMeAndSomeone,
              betweenSomeoneAndMe,
              commaSeparator,
              andSeparator
            );
            const windowObserver2 = new WindowObserverContacts(
              windowManager,
              callback2
            );
            monkeyPatchAllWindows(windowManager, callback2);
            Services.ww.registerNotification(windowObserver2);

            return () => {
              Services.ww.unregisterNotification(windowObserver2);
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win) => {
                win.gDBView.removeColumnHandler("betweenCol");
                win.document.getElementById("betweenCol").remove();
                win.document.getElementById("betweenColSplitter").remove();
              });
            };
          },
        }).api(),
      },
    };
  }
};

function createColumn(columnName, columnTooltip, win, id) {
  let treecol = win.document.createXULElement("treecol");
  [
    ["id", "betweenCol"],
    ["flex", "4"],
    ["persist", "width hidden ordinal"],
    ["label", columnName],
    ["tooltiptext", columnTooltip],
  ].forEach(function ([k, v]) {
    treecol.setAttribute(k, v);
  });
  // Work around for Thunderbird not managing to restore the column
  // state properly any more for mixed-WebExtensions.
  // This is coupled with the `unload` handler below.
  win.setTimeout(() => {
    if (
      !Services.prefs.getBoolPref("conversations.betweenColumnVisible", true)
    ) {
      treecol.setAttribute("hidden", "true");
    } else {
      treecol.removeAttribute("hidden");
    }
  }, 1000);
  let parent3 = win.document.getElementById("threadCols");
  parent3.appendChild(treecol);
  let splitter = win.document.createXULElement("splitter");
  splitter.id = "betweenColSplitter";
  splitter.classList.add("tree-splitter");
  parent3.appendChild(splitter);
}

async function registerColumn(
  emails,
  betweenMeAndSomeone,
  betweenSomeoneAndMe,
  commaSeparator,
  andSeparator,
  win,
  id
) {
  // This has to be the first time that the documentation on MDC
  //  1) exists and
  //  2) is actually relevant!
  //
  //            OMG !
  //
  // https://developer.mozilla.org/en/Extensions/Thunderbird/Creating_a_Custom_Column

  // It isn't quite right to do this ahead of time, but it saves us having
  // to get the number of identities twice for every cell. Users don't often
  // add or remove identities/accounts anyway.
  const multipleIdentities = emails.length > 1;
  function hasIdentity(emails, emailAddress) {
    const email = emailAddress.toLowerCase();
    return emails.some((e) => e.toLowerCase() == email);
  }

  let participants = function (msgHdr) {
    try {
      // The set of people involved in this email.
      let people = new Set();
      // Helper for formatting; depending on the locale, we may need a different
      // for me as in "to me" or as in "from me".
      let format = function (x, p) {
        if (hasIdentity(emails, x.email)) {
          let display = p ? betweenMeAndSomeone : betweenSomeoneAndMe;
          if (multipleIdentities) {
            display += " (" + x.email + ")";
          }
          return display;
        }
        return x.name || x.email;
      };
      // Add all the people found in one of the msgHdr's properties.
      let addPeople = function (prop, pos) {
        let line = msgHdr[prop];
        for (let x of parseMimeLine(line, true)) {
          people.add(format(x, pos));
        }
      };
      // We add everyone
      addPeople("author", true);
      addPeople("recipients", false);
      addPeople("ccList", false);
      addPeople("bccList", false);
      // And turn this into a human-readable line.
      if (people.size) {
        return joinWordList(people, commaSeparator, andSeparator);
      }
    } catch (ex) {
      console.error("Error in the special column", ex);
    }
    return "-";
  };

  let columnHandler = {
    getCellText(row, col) {
      let msgHdr = win.gDBView.getMsgHdrAt(row);
      return participants(msgHdr);
    },
    getSortStringForRow(msgHdr) {
      return participants(msgHdr);
    },
    isString() {
      return true;
    },
    getCellProperties(row, col, props) {},
    getRowProperties(row, props) {},
    getImageSrc(row, col) {
      return null;
    },
    getSortLongForRow(hdr) {
      return 0;
    },
  };

  // The main window is loaded when the monkey-patch is applied
  Services.obs.addObserver(
    {
      observe(aMsgFolder, aTopic, aData) {
        win.gDBView.addColumnHandler("betweenCol", columnHandler);
      },
    },
    "MsgCreateDBView"
  );
  try {
    win.gDBView.addColumnHandler("betweenCol", columnHandler);
  } catch (e) {
    // This is really weird, but rkent does it for junquilla, and this solves
    //  the issue of enigmail breaking us... don't wanna know why it works,
    //  but it works.
    // After investigating, it turns out that without enigmail, we have the
    //  following sequence of events:
    // - jsm load
    // - onload
    // - msgcreatedbview
    // With enigmail, this sequence is modified
    // - jsm load
    // - msgcreatedbview
    // - onload
    // So our solution kinda works, but registering the thing at jsm load-time
    //  would work as well.
  }

  win.addEventListener(
    "beforeunload",
    () => {
      let col = win.document.getElementById("betweenCol");
      if (col) {
        let isHidden = col.getAttribute("hidden");
        Services.prefs.setBoolPref(
          "conversations.betweenColumnVisible",
          isHidden != "true"
        );
      }
    },
    { once: true }
  );
}

// Joins together names and format them as "John, Jane and Julie"
function joinWordList(aElements, commaSeparator, andSeparator) {
  let l = aElements.size;
  if (l == 0) {
    return "";
  }
  let elements = [...aElements.values()];
  if (l == 1) {
    return elements[0];
  }

  let hd = elements.slice(0, l - 1);
  let tl = elements[l - 1];
  return hd.join(commaSeparator) + andSeparator + tl;
}

/**
 * Wraps the low-level header parser stuff.
 *
 * @param {string} mimeLine
 *   A line that looks like "John &lt;john@cheese.com&gt;, Jane &lt;jane@wine.com&gt;"
 * @param {boolean} [dontFix]
 *   Defaults to false. Shall we return an empty array in case aMimeLine is empty?
 * @returns {Array}
 *   A list of { email, name } objects
 */
function parseMimeLine(mimeLine, dontFix) {
  if (mimeLine == null) {
    console.debug("Empty aMimeLine?!!");
    return [];
  }
  let addresses = MailServices.headerParser.parseEncodedHeader(mimeLine);
  if (addresses.length) {
    return addresses.map((addr) => {
      return {
        email: addr.email,
        name: addr.name,
        fullName: addr.toString(),
      };
    });
  }
  if (dontFix) {
    return [];
  }
  return [{ email: "", name: "-", fullName: "-" }];
}

/**
 * Returns a list of all identities.
 */
function getIdentityEmails() {
  let emails = [];
  for (let account of MailServices.accounts.accounts) {
    let server = account.incomingServer;
    if (!server || (server.type != "pop3" && server.type != "imap")) {
      continue;
    }
    for (let currentIdentity of account.identities) {
      // We're only interested in identities that have a real email.
      if (currentIdentity.email) {
        emails.push(currentIdentity.email);
      }
    }
  }
  if (!emails.length) {
    console.warn("Didn't find any identities!");
  }
  return emails;
}

/**
 * Handles observing updates on windows.
 */
class WindowObserverContacts {
  constructor(windowManager, callback) {
    this._windowManager = windowManager;
    this._callback = callback;
  }

  observe(aSubject, aTopic, aData) {
    if (aTopic == "domwindowopened") {
      if (aSubject && "QueryInterface" in aSubject) {
        const win = aSubject.QueryInterface(Ci.nsIDOMWindow).window;
        waitForWindow(win).then(() => {
          if (
            win.document.location !=
              "chrome://messenger/content/messenger.xul" &&
            win.document.location !=
              "chrome://messenger/content/messenger.xhtml"
          ) {
            return;
          }
          this._callback(
            aSubject.window,
            this._windowManager.getWrapper(aSubject.window).id
          );
        });
      }
    }
  }
}

function waitForWindow(win) {
  return new Promise((resolve) => {
    if (win.document.readyState == "complete") {
      resolve();
    } else {
      win.addEventListener(
        "load",
        () => {
          resolve();
        },
        { once: true }
      );
    }
  });
}

function monkeyPatchAllWindows(windowManager, callback, context) {
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    waitForWindow(win).then(() => {
      callback(win, windowManager.getWrapper(win).id, context);
    });
  }
}
