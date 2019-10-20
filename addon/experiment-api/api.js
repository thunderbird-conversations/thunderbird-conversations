// Get various parts of the WebExtension framework that we need.
var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

// You probably already know what this does.
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function prefType(name) {
  switch (name) {
    case "no_friendly_date":
    case "logging_enabled":
    case "tweak_bodies":
    case "tweak_chrome":
    case "operate_on_conversations":
    case "extra_attachments":
    case "compose_in_tab":
    case "enabled":
    case "hide_sigs": {
      return "bool";
    }
    case "expand_who":
    case "hide_quote_length": {
      return "int";
    }
    case "monospaced_senders":
    case "unwanted_recipients":
    case "uninstall_infos": {
      return "char";
    }
  }
  throw new Error(`Unexpected pref type ${name}`);
}

/* exported conversations */
var conversations = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      // Again, this key must have the same name.
      conversations: {
        async setPref(name, value) {
          switch (prefType(name)) {
            case "bool": {
              Services.prefs.setBoolPref(`conversations.${name}`, value);
              break;
            }
            case "int": {
              Services.prefs.setIntPref(`conversations.${name}`, value);
              break;
            }
            case "char": {
              Services.prefs.setCharPref(`conversations.${name}`, value);
              break;
            }
          }
        },
        async getPref(name) {
          switch (prefType(name)) {
            case "bool": {
              return Services.prefs.getBoolPref(`conversations.${name}`);
            }
            case "int": {
              return Services.prefs.getIntPref(`conversations.${name}`);
            }
            case "char": {
              return Services.prefs.getCharPref(`conversations.${name}`, "");
            }
          }
          throw new Error("Unexpected pref type");
        },
      },
    };
  }
};
