var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  DisplayNameUtils: "resource:///modules/DisplayNameUtils.jsm",
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

/* exported convContacts */
var convContacts = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;
    return {
      convContacts: {
        async beginNew(beginNewProperties) {
          const window =
            beginNewProperties.windowId !== null
              ? windowManager.get(beginNewProperties.windowId, context).window
              : Services.wm.getMostRecentWindow("mail:3pane");
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
          const window =
            beginEditProperties.windowId !== null
              ? windowManager.get(beginEditProperties.windowId, context).window
              : Services.wm.getMostRecentWindow("mail:3pane");
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
      },
    };
  }
};
