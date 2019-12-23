#!/bin/bash
for a in locale/*; do
  grep $a chrome.manifest > /dev/null && echo -e "$a\tok" || echo "$a\tbad";
done
