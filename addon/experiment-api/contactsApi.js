var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  DisplayNameUtils: "resource:///modules/DisplayNameUtils.jsm",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
  Gloda: "resource:///modules/gloda/gloda.js",
  BrowserSim: "chrome://conversations/content/modules/browserSim.js",
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

          const { name, email } = options;

          const collection = await glodaQuery({
            kind: "email",
            value: email,
            query: "NOUN_IDENTITY",
          });
          if (!collection.items.length) {
            return;
          }

          const query = getQuery({
            query: "NOUN_MESSAGE",
            involvesItems: collection.items,
          });

          const browser = BrowserSim.getBrowser();
          let tabmail = window.document.getElementById("tabmail");
          tabmail.openTab("glodaList", {
            query,
            title: browser.i18n.getMessage("involvingTabTitle", [name]),
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
      },
    };
  }
};

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
