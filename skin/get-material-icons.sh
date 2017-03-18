#!/bin/sh

if which ghead >/dev/null 2>&1; then
  HEAD=ghead
else
  HEAD=head
fi

echo '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
echo '    <!-- Material icons are published under Apache License Version 2.0. https://material.io/icons/ -->'
for icon in "archive" "attachment" "code" "content_copy" "delete" "edit" "vpn_key" "expand_less" "expand_more" "forward" "inbox" "info_outline" "whatshot" "list" "more_vert" "open_in_new" "print" "reply_all" "reply" "star" "visibility" "visibility_off" "warning" "info" "add" "mail" "history" "file_download" "photo_library" "search" "account" "account_circle" "new_releases"; do
    wget -q "https://storage.googleapis.com/material-icons/external-assets/v4/icons/svg/ic_${icon}_black_24px.svg" -O - \
        | grep -v fill | $HEAD -n -1 \
        | sed "s/<path/<path id=\"${icon}\"/"
done
echo '    <!-- The Font Awesome font is licensed under the SIL OFL 1.1: http://scripts.sil.org/OFL -->'
for icon in "certificate"; do
    wget -q "https://raw.githubusercontent.com/encharm/Font-Awesome-SVG-PNG/master/black/svg/${icon}.svg" -O - \
        | sed 's/<\/\?svg[^>]*>//g'\
        | sed "s/<path/    <path id=\"${icon}\"/"
    echo ''
done
echo "</svg>"
