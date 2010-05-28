GMail Conversation View
=======================

This extension improves the threaded summary for emails in Thunderbird 3.0. It
vastly improves the UI by including some ideas from GMail. More specifically:

* your own messages are displayed in the thread;
* you initially see summaries, they can be expanded to display full messages;
* quoted parts are "folded" à la GMail;
* fast links for replying (and possibly other useful actions).

For screenshots and a stable version, please head to [AMO](https://addons.mozilla.org/en-US/thunderbird/addon/54035) which should
provide you with a ready-to-install package.

INSTALL
=======

My setup is based on Linux so get a MSYS environment with a proper make and
proper tools if you are on Windows. Anyway, it isn't that hard, it's just a set
of commands to automate uploading to my website and generating fresh versions.
To build the .xpi, just do:

    make package

If you want to develop and see your changes in real-time (assuming you have a
proper setup in your profile and you restart Thunderbird), you can link this
extension in your global thunderbird setup.

    cd thunderbird
    cd extensions
    ln -s /path/to/this/folder

Alternatively, in your profile, you can create an empty file called
"gconversation@xulforum.org" in the extensions directory. This file should only
contain one line which is the path to this folder on your hard drive.
