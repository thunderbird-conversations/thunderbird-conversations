#!/bin/sh

if which ghead >/dev/null 2>&1; then
  HEAD=ghead
else
  HEAD=head
fi

echo '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
echo '    <!-- Material icons are published under Apache License Version 2.0. https://material.io/icons/ -->'
for icon in "archive" "attachment" "code" "content_copy" "delete" "edit" "vpn_key" "expand_less" "expand_more" "forward" "file_download" "inbox" "info_outline" "whatshot" "list" "more_vert" "open_in_new" "print" "reply_all" "reply" "star" "visibility" "visibility_off" "warning" "info" "add" "mail" "history" "photo_library" "search" "account" "account_circle" "save"; do
    wget -q "https://storage.googleapis.com/material-icons/external-assets/v4/icons/svg/ic_${icon}_black_24px.svg" -O - \
        | grep -v fill | $HEAD -n -1 \
        | sed "s/<path/<path id=\"${icon}\"/"
done
echo '    <path id="new" d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12z"/>'
echo "</svg>"
