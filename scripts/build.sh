#!/bin/bash

DIST=dist
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon
EXTENSIONS="*.{css,html,mjs,js,json,gif,png,svg}"

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
REGEXTENSIONS=".*\.(html|mjs|js|json|gif|png|svg)"
mkdir -p "../$DIST"
find -E . -regex $REGEXTENSIONS -maxdepth 1 -exec cp {} ../$DIST/ \;
# Other items we need that aren't handled by webpack.
DIRECTORIES=(assistant background content/icons content/modules \
experiment-api)
for a in "${DIRECTORIES[@]}"; do
  mkdir -p ../$DIST/${a}/
  find -E $a -regex $REGEXTENSIONS -exec cp {} ../$DIST/$a/ \;
done
for dir in _locales/*; do
  mkdir -p ../$DIST/${dir}/
  find -E $dir -regex $REGEXTENSIONS -exec cp {} ../$DIST/$dir/ \;
done
# This directory just needs the css file.
mkdir -p ../$DIST/content/components/compose
find -E . -name "*.css" -exec cp {} ../$DIST/{} \;
cp content/stubGlobals.js ../${DIST}/content/
cp content/stubWrapper.* ../${DIST}/content/

popd

# The babel compilation was done in parallel. Wait for it to finish before packaging.
wait $(jobs -p)

rm -f conversations.xpi
pushd $DIST
zip -r ../conversations.xpi * -x "tests/*" -x "dev-frame/*" -x "content/dev-frame.bundle.js"
popd
# npx web-ext build --overwrite-dest
