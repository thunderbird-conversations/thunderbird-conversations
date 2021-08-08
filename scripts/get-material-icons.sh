#!/bin/sh

if which ghead >/dev/null 2>&1; then
  HEAD=ghead
else
  HEAD=head
fi

echo '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
echo '    <!-- Material icons are published under Apache License Version 2.0. https://fonts.google.com/icons?selected=Material+Icons -->'
for icon in "archive" "attachment" "calendar_today" "code" "content_copy" "delete" "delete_forever" "edit" "vpn_key" "expand_less" "expand_more" "forward" "file_download" "inbox" "whatshot" "list" "more_vert" "open_in_new" "person" "print" "reply_all" "reply" "save_alt" "star" "visibility" "visibility_off" "warning" "info" "add" "mail" "history" "photo_library" "search" "account" "account_circle" "save"; do
    wget -q "https://fonts.gstatic.com/s/i/materialicons/${icon}/v1/24px.svg?download=true" -O - \
        | $HEAD -n 1 \
        | sed "s/<path d=\"[a-zA-Z0-9 ]*\" fill=\"none\"\/>//g" \
        | sed "s/<path fill=\"none\" d=\"[a-zA-Z0-9 ]*\"\/>//g" \
        | sed "s/<svg[^>]*>//" | sed "s/<\/svg>//" \
        | sed "s/<path /    <path id=\"${icon}\" /"
    echo
done
for icon in "info"; do
  wget -q "https://fonts.gstatic.com/s/i/materialiconsoutlined/${icon}/v1/24px.svg?download=true" -O - \
      | $HEAD -n 1 \
      | sed "s/<path d=\"[a-zA-Z0-9 ]*\" fill=\"none\"\/>//g" \
      | sed "s/<path fill=\"none\" d=\"[a-zA-Z0-9 ]*\"\/>//g" \
      | sed "s/<svg[^>]*>//" | sed "s/<\/svg>//" \
      | sed "s/<path /    <path id=\"${icon}_outline\" /"
  echo
done
echo '    <path id="new" d="M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12z"/>'
echo "</svg>"
