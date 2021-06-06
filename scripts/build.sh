#!/bin/bash

DIST=dist
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon

rm -rf $DIST
mkdir -p $VENDOR_DIR

if [ "$1" == "--prod" ]
then
  MODE="production"
  cp node_modules/pdfjs-dist/build/pdf.min.js $VENDOR_DIR/pdf.js
  cp node_modules/pdfjs-dist/build/pdf.worker.min.js $VENDOR_DIR/pdf.worker.js
else
  MODE="development"
  cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR/pdf.js
  cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR/pdf.worker.js
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
'::content/icons' '::content/modules' '::content/pdfviewer' 'content/stubGlobals.js' \
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
