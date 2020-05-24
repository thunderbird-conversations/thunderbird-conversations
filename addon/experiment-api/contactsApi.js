var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  DisplayNameUtils: "resource:///modules/DisplayNameUtils.jsm",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
  Gloda: "resource:///modules/gloda/gloda.js",
  MailServices: "resource:///modules/MailServices.jsm",
  getIdentities: "chrome://conversations/content/modules/misc.js",
});

/**
 * Creates a Gloda query object
 *
 * @param {string} [options={
 *     kind: "email",
 *     value: null,
 *     query: "NOUN_IDENTITY",
 *     involvesItems: null,
 *   }]
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
 * @param {string} [options={
 *     kind: "email",
 *     value: null,
 *     query: "NOUN_IDENTITY",
 *     involvesItems: null,
 *   }]
 * @returns
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
    const { windowManager } = extension;
    return {
      convContacts: {
        async beginNew(beginNewProperties) {
          const window = getWindowFromId(
            windowManager,
            context,
            beginNewProperties.windowId
          );
          const args = {};
          if (beginNewProperties.email !== null) {
            args.primaryEmail = beginNewProperties.email;
          }
          if (beginNewProperties.displayName !== null) {
            args.displayName = beginNewProperties.displayName;
          }
          window.openDialog(
            "chrome://messenger/content/addressbook/abNewCardDialog.xul",
            "",
            "chrome,resizable=no,titlebar,modal,centerscreen",
            args
          );
        },
        async beginEdit(beginEditProperties) {
          const window = getWindowFromId(
            windowManager,
            context,
            beginEditProperties.windowId
          );
          let cardAndBook = DisplayNameUtils.getCardForEmail(
            beginEditProperties.email
          );
          const args = {
            abURI: cardAndBook.book.URI,
            card: cardAndBook.card,
          };
          window.openDialog(
            "chrome://messenger/content/addressbook/abEditCardDialog.xul",
            "",
            "chrome,modal,resizable=no,centerscreen",
            args
          );
        },
        async composeNew(properties) {
          const window = getWindowFromId(
            windowManager,
            context,
            properties.windowId
          );
          const { to } = properties;
          composeMessageTo(to, window.gFolderDisplay.displayedFolder);
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
        async getIdentities(options) {
          const { includeNntpIdentities } = options;

          // `getIdentities` returns NCPWrapper objects, but we want
          // javascript objects. JSON.stringify is an easy way to convert
          // to a serializable native object.
          return JSON.parse(
            JSON.stringify(getIdentities(!includeNntpIdentities))
          );
        },
        onColumnHandler: new ExtensionCommon.EventManager({
          context,
          name: "convContacts.onColumnHandler",
          register(fire, columnName, columnTooltip) {
            let callback = createColumn.bind(null, columnName, columnTooltip);
            const windowObserver = new WindowObserverContacts(
              windowManager,
              callback
            );
            monkeyPatchAllWindows(windowManager, callback);
            Services.ww.registerNotification(windowObserver);

            return () => {
              Services.ww.unregisterNotification(windowObserver);
              monkeyPatchAllWindows(windowManager, (win) => {
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

/**
 * Open a composition window for the given email address.
 * @param aEmail {String}
 * @param aDisplayedFolder {nsIMsgFolder} pass gFolderDisplay.displayedFolder
 */
function composeMessageTo(aEmail, aDisplayedFolder) {
  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  fields.to = aEmail;
  params.type = Ci.nsIMsgCompType.New;
  params.format = Ci.nsIMsgCompFormat.Default;
  if (aDisplayedFolder) {
    params.identity = MailServices.accounts.getFirstIdentityForServer(
      aDisplayedFolder.server
    );
  }
  params.composeFields = fields;
  MailServices.compose.OpenComposeWindowWithParams(null, params);
}

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

function monkeyPatchAllWindows(windowManager, callback) {
  for (const win of Services.wm.getEnumerator("mail:3pane")) {
    waitForWindow(win).then(() => {
      callback(win, windowManager.getWrapper(win).id);
    });
  }
}
