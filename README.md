Thunderbird Conversations
=========================

This extension improves the threaded summary for emails in Thunderbird 3.0. It
vastly improves the UI by including some ideas from GMail. More specifically:

* your own messages are displayed in the thread,
* you initially see summaries, they can be expanded to display full messages,
* quoted sections are collapsed à la GMail,
* fast links for replying (and possibly other useful actions),
* you can reply inline (through a "quick reply" feature),
* integration with Thunderbird Contacts.

For screenshots and a stable version, please head to
[AMO](https://addons.mozilla.org/en-US/thunderbird/addon/54035) which should
provide you with a ready-to-install package.

If you want to leave some feedback, we have a thread on [Google
Groups](https://groups.google.com/forum/#!topic/mozilla-labs/Jx8CxMvAoVk).

INSTALL
=======

If you just want to start hacking, see
[MDC](https://developer.mozilla.org/en/Setting_up_extension_development_environment)
to learn how to use a proxy file. If you want to package a release,
`./package.sh build` will package a .xpi file.

HACKING
=======

This repo contains a git submodule. To make sure you've checked out all the
files, make sure you run:

    git submodule init
    git submodule update

before you start hacking. You also need to run `make` in the `content/pdfjs`
directory for the embedded pdf viewer to work properly.

TESTING
=======

There are tests for this addon. They are distributed as a MQ patch that you
need to qimport into your comm-central tree. The file is
tests/mozmill-conversations. Once you qimport'd it,

    jonathan@ramona:~/Code/objdir-comm-central $ make \
    MOZMILL_EXTRA=--addon=/home/jonathan/Code/gconversation@xulforum.org/conversations.xpi \
    SOLO_TEST=conversations/test-attachments.js mozmill-one

