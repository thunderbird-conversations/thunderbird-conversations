/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Handles install and uninstall of a simple customization.
 */
class SimpleCustomization {
  constructor(desiredValue, getter, setter) {
    this._desiredValue = desiredValue;
    if (getter) {
      this._get = getter;
    }
    if (setter) {
      this._set = setter;
    }
  }

  async install() {
    let oldValue = await this._get();
    if (oldValue != this._desiredValue) {
      await this._set(this._desiredValue);
    }
    return oldValue;
  }

  async uninstall(oldValue) {
    let currentValue = await this._get();
    if (currentValue == this._desiredValue && currentValue != oldValue) {
      await this._set(oldValue);
    }
  }
}

/**
 * Handles a core preference customization.
 */
class PrefCustomization extends SimpleCustomization {
  constructor({ prefName, value }) {
    super(
      value,
      () => {
        return browser.conversations.getCorePref(this._prefName);
      },
      (val) => {
        return browser.conversations.setCorePref(this._prefName, val);
      }
    );
    this._prefName = prefName;
  }
}

/**
 * Handles a multiple customizations in one group.
 */
class MultipleCustomization {
  constructor(customizations) {
    this._customizations = customizations;
  }

  /**
   * Install the customisations.
   *
   * @param {browser.mailTabs.MailTab} mailTab
   * @returns {Promise<string[]>}
   */
  async install(mailTab) {
    let result = [];
    for (let c of this._customizations) {
      result.push(await c.install(mailTab));
    }
    return result;
  }

  async uninstall(uninstallInfos) {
    for (let i = 0; i < this._customizations.length; i++) {
      await this._customizations[i].uninstall(uninstallInfos[i]);
    }
  }
}

const installActions = {
  actionEnableGloda: new PrefCustomization({
    prefName: "mailnews.database.global.indexer.enabled",
    value: true,
  }),

  actionSetupView: new MultipleCustomization([
    new PrefCustomization({
      prefName: "mailnews.default_sort_order",
      value: 1,
    }),
    new PrefCustomization({
      prefName: "mailnews.default_sort_type",
      value: 18,
    }),
    new PrefCustomization({
      prefName: "mailnews.default_view_flags",
      value: 1,
    }),
    {
      /**
       * Install the customisation.
       *
       * @param {browser.mailTabs.MailTab} mailTab
       * @returns {Promise<any>}
       */
      async install(mailTab) {
        let newParams = {
          /** @type {browser.mailTabs._MailTabPropertiesSortType} */
          sortType: undefined,
          /** @type {browser.mailTabs._MailTabPropertiesSortOrder} */
          sortOrder: undefined,
          /** @type {browser.mailTabs._MailTabPropertiesViewType} */
          viewType: undefined,
        };
        let original = {};
        if (mailTab.sortType != "date" || mailTab.sortOrder != "ascending") {
          original.sortType = mailTab.sortType;
          original.sortOrder = mailTab.sortOrder;

          newParams.sortType = "date";
          newParams.sortOrder = "ascending";
        }

        if (mailTab.viewType != "groupedByThread") {
          original.viewType = mailTab.viewType;

          newParams.viewType = "groupedByThread";
        }

        if (Object.getOwnPropertyNames(newParams).length) {
          await browser.mailTabs.update(mailTab.id, newParams);
        }

        return original;
      },
      async uninstall(uninstallInfos, mailTab) {
        let newParams = {};
        if (uninstallInfos.sortType && uninstallInfos.sortOrder) {
          newParams.sortType = uninstallInfos.sortType;
          newParams.sortOrder = uninstallInfos.sortOrder;
        }
        if (uninstallInfos.viewType) {
          newParams.viewType = uninstallInfos.viewType;
        }
        if (Object.getOwnPropertyNames(newParams).length) {
          await browser.mailTabs.update(mailTab.id, newParams);
        }
      },
    },
  ]),

  actionEnsureMessagePaneVisible: new SimpleCustomization(
    true,
    async () => {
      let tabs = await browser.mailTabs.query({ active: true });
      return tabs?.[0].messagePaneVisible;
    },
    (value) => {
      return browser.mailTabs.update({ messagePaneVisible: value });
    }
  ),

  actionOfflineDownload: {
    async install() {
      let changedFolders = [];
      let changedServers = [];

      let accounts = await browser.accounts.list();

      for (let account of accounts) {
        if (account.type != "imap") {
          continue;
        }

        let setting = await browser.conversations.getAccountOfflineDownload(
          account.id
        );

        if (!setting) {
          await browser.conversations.setAccountOfflineDownload(
            account.id,
            true
          );
          changedServers.push(account.id);
        }

        async function checkSubFolders(folders) {
          for (let folder of folders) {
            if (folder.type == "inbox" || folder.type == "sent") {
              let offline =
                await browser.conversations.getFolderOfflineDownload(
                  account.id,
                  folder.path
                );

              if (!offline) {
                await browser.conversations.setFolderOfflineDownload(
                  account.id,
                  folder.path,
                  true
                );
                changedFolders.push([account.id, folder.path]);
              }
            }
            await checkSubFolders(folder.subFolders);
          }
        }

        await checkSubFolders(account.folders);
      }

      return [changedServers, changedFolders];
    },

    async uninstall([changedServers, changedFolders]) {
      for (let info of changedFolders) {
        await browser.conversations.setFolderOfflineDownload(
          info[0],
          info[1],
          false
        );
      }
      for (let accountId of changedServers) {
        await browser.conversations.setAccountOfflineDownload(accountId, false);
      }
    },
  },
  // TODO: actionEnableBetween
};

/**
 * This class handles setting up of the UI by the assistant.
 */
export class Assistant {
  async init() {
    this.portFromContentScript = null;
    browser.runtime.onConnect.addListener((port) => {
      if (port.name == "assistant") {
        this.portFromContentScript = port;
        port.onMessage.addListener(this.handleMessage.bind(this));
      }
    });
  }

  async handleMessage(message) {
    if (message.itemsToInstall) {
      await this.handleInstall(message);
      await browser.tabs.remove(message.tabId);
    } else {
      await this.handleUninstall();
    }
  }

  async handleInstall(message) {
    // Need to change to the three pane tab to be able to do some of the
    // customisation.
    let mailTabs = await browser.tabs.query({
      currentWindow: true,
      mailTab: true,
    });
    if (!mailTabs.length) {
      console.error("Could not find a mail tab to switch to!");
    } else {
      await browser.tabs.update(mailTabs[0].id, {
        active: true,
      });
    }

    let mailTab;
    if ("get" in browser.mailTabs) {
      mailTab = await browser.mailTabs.get(mailTabs[0].id);
    } else {
      mailTab = (await browser.mailTabs.query({ active: true }))[0];
    }

    let uninstallInfos = {};
    for (let item of message.itemsToInstall) {
      if (!(item in installActions)) {
        console.error("Could not find item to install:", item);
        continue;
      }

      uninstallInfos[item] = await installActions[item].install(mailTab);
    }

    const result = await browser.storage.local.get("preferences");
    let originalUninstallInfo = result.preferences.uninstall_infos;
    if (originalUninstallInfo == "{}") {
      result.preferences.uninstall_infos = uninstallInfos;
      await browser.storage.local.set({ preferences: result.preferences });
    } else {
      console.warn("Uninstall information already there, not overwriting...");
    }
  }

  async handleUninstall() {
    const result = await browser.storage.local.get("preferences");
    let uninstallInfos = result.preferences.uninstall_infos;

    let mailTabs = await browser.tabs.query({
      currentWindow: true,
      mailTab: true,
    });
    if (!mailTabs.length) {
      console.error("Could not find a mail tab to switch to!");
    } else {
      await browser.tabs.update(mailTabs[0].id, {
        active: true,
      });
    }

    let mailTab;
    if ("get" in browser.mailTabs) {
      mailTab = await browser.mailTabs.get(mailTabs[0].id);
    } else {
      mailTab = (await browser.mailTabs.query({ active: true }))[0];
    }

    for (let [action, info] of Object.entries(uninstallInfos)) {
      await installActions[action].uninstall(info, mailTab);
    }

    result.preferences.uninstall_infos = "{}";
    browser.storage.local.set({ preferences: result.preferences });
  }
}
