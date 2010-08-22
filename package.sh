#!/bin/sh
BRANCH=`git branch | egrep "\\* (.*)" | cut -c 3-`
DATE=`date +%Y%m%d%H%M`
TARGET_FILENAME="$DATE-$BRANCH.xpi"
GNUFILE=/Users/protz/bin/switchtognuutils

if [ -f "$GNUFILE" ]; then
  . "$GNUFILE";
fi;

template() {
  sed s/__REPLACEME__/.$1/ install.rdf.template > install.rdf
}

upload() {
  echo "cd jonathan/files\nput ../conversations.xpi gcv-nightlies/$TARGET_FILENAME\n\
    put Changelog gcv-nightlies/Changelog_$BRANCH" | ftp xulforum@ftp.xulforum.org
}

if [ "$1" = "official" ]; then
  template "";
  ./build.sh
  upload;
else
  template "$DATE"pre;
  ./build.sh
  upload;
  rm -f conversations.xpi;
fi
