#!/bin/bash

DIST=dist
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon

rm -rf $DIST
mkdir -p $VENDOR_DIR

if [ "$1" == "--prod" ]
then
  MODE="production"
else
  MODE="development"
fi

cp LICENSE README.md $DIST/

npx webpack --mode=$MODE

if [ $? -ne 0 ]; then
  exit 1;
fi
#
pushd $ADDON_DIR
# Copy the top-level add-on files.
for a in $(git ls-files ':!:**/**'); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done
# Other items we need that aren't handled by webpack.
for a in $(git ls-files \
'::_locales' \
'::assistant' \
'::background' \
'::content/icons' '::content/modules' 'content/stubGlobals.js' \
'content/stubWrapper.*' \
'::experiment-api' '::*.css' ); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done

popd

# The babel compilation was done in parallel. Wait for it to finish before packaging.
wait $(jobs -p)

rm -f conversations.xpi
pushd $DIST
zip -r ../conversations.xpi * -x "tests/*" -x "dev-frame/*" -x "content/dev-frame.bundle.js"
popd
# npx web-ext build --overwrite-dest
