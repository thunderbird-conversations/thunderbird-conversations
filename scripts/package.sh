#!/bin/sh
BRANCH=`git branch | egrep "\\* (.*)" | cut -c 3-`
DATE=`date +%Y%m%d%H%M`
TARGET_FILENAME="$DATE-$BRANCH.xpi"

pushd ..

./scripts/build.sh
scp conversations.xpi jonathan@protzenko.fr:~/Web/jonathan/thunderbird-conversations/$TARGET_FILENAME
rm -f conversations.xpi

popd