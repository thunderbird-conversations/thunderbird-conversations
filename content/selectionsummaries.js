var q1, q2;
function summarizeThread(aSelectedMessages)
{
  if (aSelectedMessages.length == 0)
    return;

  try {
    q1 = Gloda.getMessageCollectionForHeaders(aSelectedMessages, {
      onItemsAdded: function () {},
      onItemsModified: function () {},
      onItemsRemoved: function () {},
      onQueryCompleted: function (aCollection) {
        let items = aCollection.items;
        let msg = items[0];
        let query = Gloda.newQuery(Gloda.NOUN_MESSAGE)
        query.conversation(msg.conversation);
        //query.getCollection({
        q2 = msg.conversation.getMessagesCollection({
          onItemsAdded: function () {},
          onItemsModified: function () {},
          onItemsRemoved: function () {},
          onQueryCompleted: function (aCollection) {
            let selectedMessages = [];
            for (let i = 0; i < aCollection.items.length; ++i) {
              let item = aCollection.items[i];
              selectedMessages.push(item.folderMessage);
            }
            gSummary = new ThreadSummary(selectedMessages);
            gSummary.init();
            return;
          },
        }, true);
      },
    }, true);
  } catch (e) {
    dump("Exception in summarizeThread" + e + "\n");
    logException(e);
    Components.utils.reportError(e);
    throw(e);
  }
}
