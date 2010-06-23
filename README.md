GMail Conversation View
=======================

This extension improves the threaded summary for emails in Thunderbird 3.0. It
vastly improves the UI by including some ideas from GMail. More specifically:

* your own messages are displayed in the thread;
* you initially see summaries, they can be expanded to display full messages;
* quoted sections are collapsed à la GMail;
* fast links for replying (and possibly other useful actions).

For screenshots and a stable version, please head to [AMO](https://addons.mozilla.org/en-US/thunderbird/addon/54035) which should
provide you with a ready-to-install package.

INSTALL
=======

My setup is based on Linux, it's been known to work fine on Mac too. If you want
to build the .xpi, just run:

    make package

If you want to develop and see your changes in real-time (assuming you have a
proper setup in your profile and you restart Thunderbird), the best way to do
that is for you to create an empty file called "gconversation@xulforum.org" in
the extensions/ directory. This file should only contain one line which is the
path to the folder contaning the source code on your hard drive.
