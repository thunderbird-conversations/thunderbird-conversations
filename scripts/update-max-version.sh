#!/bin/bash

ADDON="."

THUNDERBIRD_VERSION=`curl -L -s --fail-with-body https://raw.githubusercontent.com/mozilla/releases-comm-central/HEAD/mail/config/version_display.txt`
if [[ $? -ne 0 ]]; then
	echo CURL FAILED
  exit 1
fi
echo $THUNDERBIRD_VERSION

if [[ $THUNDERBIRD_VERSION == "" ]]; then
  echo Failed to get Thunderbird version
  exit 1
fi

# Ubuntu's version of sed doesn't have -i
sed -e "s/\"strict_max_version\": \".*\"/\"strict_max_version\": \"${THUNDERBIRD_VERSION}\"/" \
    ${ADDON}/addon/manifest.json > ${ADDON}/addon/manifest.json.gen
mv ${ADDON}/addon/manifest.json.gen ${ADDON}/addon/manifest.json
