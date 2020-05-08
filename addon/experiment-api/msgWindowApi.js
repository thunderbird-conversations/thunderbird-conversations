var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionCommon: "resource://gre/modules/ExtensionCommon.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

function getWindowFromId(windowManager, context, id) {
  return id !== null && id !== undefined
    ? windowManager.get(id, context).window
    : Services.wm.getMostRecentWindow("mail:3pane");
}

/* exported convMsgWindow */
var convMsgWindow = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;
    return {
      convMsgWindow: {
        async isSelectionExpanded(windowId) {
          const win = getWindowFromId(windowManager, context, windowId);
          const msgIndex = win.gFolderDisplay
            ? win.gFolderDisplay.selectedIndices[0]
            : -1;
          if (msgIndex >= 0) {
            try {
              let viewThread = win.gDBView.getThreadContainingIndex(msgIndex);
              let rootIndex = win.gDBView.findIndexOfMsgHdr(
                viewThread.getChildHdrAt(0),
                false
              );
              if (rootIndex >= 0) {
                return (
                  win.gDBView.isContainer(rootIndex) &&
                  !win.gFolderDisplay.view.isCollapsedThreadAtIndex(rootIndex)
                );
              }
            } catch (ex) {
              console.error("Error in the onLocationChange handler", ex);
            }
          }
          return false;
        },
        async isSelectionThreaded(windowId) {
          const win = getWindowFromId(windowManager, context, windowId);
          // If we're not showing threaded, then we only worry about how many
          // messages are selected.
          if (!win.gFolderDisplay.view.showThreaded) {
            return false;
          }

          return !(await this.isSelectionExpanded(windowId));
        },
      },
    };
  }
};
