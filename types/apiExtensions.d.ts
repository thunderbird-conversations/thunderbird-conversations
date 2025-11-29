interface WebExtEventWithParam<
  TCallback extends (...args: any[]) => any,
  TParam,
> {
  addListener(cb: TCallback, param: TParam): void;
  removeListener(cb: TCallback, param: TParam): void;
  hasListener(cb: TCallback): boolean;
}

interface WebExtEventWith2Param<
  TCallback extends (...args: any[]) => any,
  TParam,
  TParam2,
> {
  addListener(cb: TCallback, param: TParam, param2: TParam2): void;
  removeListener(cb: TCallback, param: TParam, param2: TParam2): void;
  hasListener(cb: TCallback): boolean;
}

declare namespace browser {
  // TODO: Add to core types.
  export namespace messengerUtilities {
    interface ParsedMailbox {
      name?: string;
      email?: string;
      group?: ParsedMailbox[];
    }

    export function convertToPlainText(
      body: string,
      options?: { flowed?: boolean }
    ): Promise<string>;
    export function formatFileSize(sizeInBytes: number): Promise<string>;
    export function parseMailboxString(
      maiboxString: string,
      preserveGroups?: boolean
    ): Promise<ParsedMailbox>;
  }

  export namespace convCalendar {
    export function onMessageNotification(
      winId: number,
      tabId: number,
      msgId: number,
      action: string
    ): Promise<void>;

    export function messageUnloaded(
      winId: number,
      tabId: number,
      msgId: number
    ): Promise<void>;

    export const onListenForInvites: WebExtEventWith2Param<
      () => void,
      number,
      number
    >;
  }

  export namespace convContacts {
    interface beginNewProperties {
      email?: string;
      displayName?: string;
      parentId?: string;
      windowId?: number;
    }
    export function beginNew(beginNewProperties): Promise<void>;

    interface beginEditProperties {
      contactId: string;
      windowId?: number;
    }
    export function beginEdit(beginEditProperties): Promise<void>;

    interface showMessagesInvolvingProperties {
      title: string;
      email: string;
      windowId?: number;
    }
    export function showMessagesInvolving(
      showMessagesInvolvingProperties
    ): Promise<void>;

    interface makeMimeAddressProperties {
      email: string;
      name: string;
    }
    export function makeMimeAddress(makeMimeAddressProperties): Promise<string>;

    interface ColumnHandlerEvent {
      addListener(
        callback: () => void,
        columnName: string,
        columnTooltip: string,
        betweenMeAndSomeone: string,
        betweenSomeoneAndMe: string,
        commaSeparator: string,
        andSeparator: string
      ): void;
      removeListener(callback: () => void): void;
      hasListener(callback: () => void): boolean;
    }
    export const onColumnHandler: ColumnHandlerEvent;
  }

  export namespace convGloda {
    export const queryConversationMessages: WebExtEventWith2Param<
      (event: object) => void,
      number[],
      number
    >;
  }

  export namespace convOpenPgp {
    export function beforeStreamingMessage(
      tabId: number,
      msgId: number,
      dueToReload?: boolean
    ): Promise<void>;
    export function handleMessageStreamed(
      tabId: number,
      msgId: number
    ): Promise<void>;
    export function handleTagClick(tabId: number, msgId: number): Promise<void>;

    export const onSMIMEReload: WebExtEvent<(id: number) => Promise<any>>;
    export const onSMIMEStatus: WebExtEvent<
      (id: number, signedStatus: string) => Promise<any>
    >;
    export const onUpdateSecurityStatus: WebExtEvent<
      (
        id: number,
        signedStatus: string,
        encryptionStatus: string,
        encryptionNotification: string,
        details: any
      ) => Promise<any>
    >;
  }

  export namespace conversations {
    export function getCorePref(name: string): Promise<any>;
    export function setCorePref(name: string, value: any): Promise<void>;
    export function getMessageIdForUri(uri: string): Promise<number>;
    export function getMessageUriForId(id: number): Promise<string>;
    interface createTabProperties {
      url: string;
      type: string;
      windowId: number;
    }
    export function createTab(createTabProperties): Promise<void>;
    export function createFilter(
      email: string,
      windowId: number
    ): Promise<void>;
    export function resetMessagePane(): Promise<void>;
    export function invalidateCache(): Promise<void>;
    export function getLateAttachments(
      id: number,
      extraAttachments: boolean
    ): Promise<any>;
    export function makePlural(
      pluralForm: string,
      message: string,
      value: number
    ): Promise<string>;
    export function markSelectedAsJunk(
      tabId: number,
      isJunk: boolean
    ): Promise<void>;
    export function sendUnsent(): Promise<void>;
    export function openInSourceView(id: number): Promise<void>;
    export function openInClassic(id: number): Promise<void>;
    export function showRemoteContent(id: number): Promise<void>;
    export function alwaysShowRemoteContent(email: string): Promise<void>;
    export function beginEdit(id: number, type: string): Promise<void>;
    export function ignorePhishing(id: number): Promise<void>;

    interface downloadAllAttachmentsProperties {
      winId?: number;
      tabId?: number;
      msgId: number;
      partNames: string[];
    }
    export function downloadAllAttachments(
      downloadAllAttachmentsProperties
    ): Promise<void>;

    interface genericAttachmentProperties {
      winId?: number;
      tabId?: number;
      msgId: number;
      partName: string;
    }

    export function downloadAttachment(
      downloadAttachmentProperties
    ): Promise<void>;
    export function detachAttachment(
      genericAttachmentProperties
    ): Promise<void>;
    export function makeFriendlyDateAgo(date: number): Promise<string>;
    export function quoteMsgHdr(
      id: number,
      plainText?: boolean
    ): Promise<string>;

    interface bodyAsTextProperties {
      winId?: number;
      tabId?: number;
      msgId: number;
    }
    export function bodyAsText(bodyAsTextProperties): Promise<string>;

    export function getAccountOfflineDownload(accountId): Promise<string>;

    interface streamMessageProperties {
      winId?: number;
      tabId?: number;
      msgId: number;
      iframeClass: string;
    }
    export function streamMessage(streamMessageProperties): Promise<boolean>;

    interface fireLoadCompletedProperties {
      winId?: number;
      tabId?: number;
    }
    export function fireLoadCompleted(
      fireLoadCompletedProperties
    ): Promise<void>;

    export function setAccountOfflineDownload(
      accountId: string,
      value: boolean
    ): Promise<void>;

    export function getFolderOfflineDownload(
      accountId: string,
      path: string
    ): Promise<boolean>;

    export function setFolderOfflineDownload(
      accountId: string,
      path: string,
      value: boolean
    ): Promise<void>;

    export function getReplyOnTop(identityId: string): Promise<number>;

    export function postMessageViaBrowserSim(msg: any): Promise<any>;

    export const onCallAPI: WebExtEvent<
      (apiName: string, apiItem: string, args: any[]) => Promise<any>
    >;

    export const onCorePrefChanged: WebExtEventWithParam<() => void, string>;

    export const onSetConversationPreferences: WebExtEvent<() => void>;
  }

  export namespace convCompose {
    interface sendProperties {
      from: string;
      to: string;
      subject: string;
      body: string;
      originalMsgId: number;
    }

    export function send(sendProperties): Promise<void>;
  }

  export namespace convMsgWindow {
    export function maybeReloadMultiMessage(tabId: number): Promise<void>;
    export function openNewWindow(url: string, params?: string): Promise<void>;
    export function print(window: number, iframeId: string): Promise<void>;

    export const onSelectedMessagesChanged: WebExtEventWithParam<
      (msgs: messages.MessageHeader[]) => void,
      number
    >;

    interface cancellableResult {
      cancel?: boolean;
    }
    export const onThreadPaneActivate: WebExtEventWithParam<
      (tabId: number, msgHdrs: messages.MessageHeader) => cancellableResult,
      number
    >;
    export const onMonkeyPatch: WebExtEventWithParam<() => void, number>;
  }
}
