#!/bin/bash
DIST=dist-dev-html
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon
DEV_SERVER_PORT=8126
export NODE_ENV=development

WATCH_FLAG=""
if [ "$1" = "--watch" ]
then
  echo "Watching files for changes with --watch"
  WATCH_FLAG="--watch"
fi

mkdir -p $VENDOR_DIR

cp LICENSE README.md $DIST/

echo "    Watching webpack files"
npx webpack --mode=development --watch --output-path=./${DIST}/content &

echo "    Copying non-jsx files"
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
'::content/icons' '::content/modules' 'content/stubGlobals.js' \
'content/stubWrapper.*' '::dev-frame/icons' \
'::experiment-api' '::*.css' ); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done
# Additional icon copying.
cp content/icons/* ../${DIST}/dev-frame/icons

popd

wait $(jobs -p)
