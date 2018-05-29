Thunderbird Conversations
=========================

This extension improves the threaded summary for emails in Thunderbird. It
vastly improves the UI by including some ideas from GMail. More specifically:

* your own messages are displayed in the thread,
* you initially see summaries, they can be expanded to display full messages,
* quoted sections are collapsed à la GMail,
* fast links for replying (and possibly other useful actions),
* you can reply inline (through a "quick reply" feature).

For screenshots and a stable version, please head to
[AMO](https://addons.mozilla.org/en-US/thunderbird/addon/54035) which should
provide you with a ready-to-install package.

If you want to leave some feedback, we have a thread on [Google
Groups](https://groups.google.com/forum/#!topic/mozilla-labs/Jx8CxMvAoVk).

INSTALL
=======

If you just want to start hacking, see
[MDC](https://developer.mozilla.org/en/Setting_up_extension_development_environment)
to learn how to use a proxy file. If you want to package a release, follow
these steps.

1. Download the [zip archive](https://github.com/protz/thunderbird-conversations/archive/master.zip) or clone the repository
2. Change into the main folder, run `git submodule init` and `git submodule update`
3. Run `npm install`
4. Run `npm run build`

This will package an `.xpi` file of the latest codebase which can be installed via add-on manager in Thunderbird.
Please note that the latest `thunderbird-conversations`-builds are sometimes only compatible with the `Daily`-version of Thunderbird. You can build this from source or get a pre-built binary at http://ftp.mozilla.org/pub/mozilla.org/thunderbird/nightly/latest-comm-central/.

TESTING
=======

To run the tests:

```
$ npm test
```
