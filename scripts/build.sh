#!/bin/bash

NOT='.sh$|^.git|.jsx$|.js$|.html$|.xhtml^tests|^.eslint|^.travis|^package.json$|^package-lock.json$|^.prettierrc'
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

pushd $ADDON_DIR
# Copy most things, apart from the excluded files.
for a in $(git ls-files | egrep -v $NOT); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done
# Now copy html/js files that we don't use webpack for.
for a in $(git ls-files | egrep '.js$|.html$' | egrep '^assistant|^content/modules|^content/pdfviewer|^experiment-api'); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done
for a in $(git ls-files ./*.* | egrep '.js$|.html$'); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done

# Now copy a few other select files that we need.
mkdir -p ../$DIST/content/es-modules/
cp content/es-modules/thunderbird-compat.js ../$DIST/content/es-modules/thunderbird-compat.js
cp content/es-modules/contact-manager.js ../$DIST/content/es-modules/contact-manager.js
cp content/es-modules/utils.js ../$DIST/content/es-modules/utils.js
cp content/utils.js ../$DIST/content/utils.js
cp content/stubGlobals.js ../$DIST/content/stubGlobals.js

popd

# The babel compilation was done in parallel. Wait for it to finish before packaging.
wait $(jobs -p)

rm -f conversations.xpi
pushd $DIST
zip -r ../conversations.xpi * -x "tests/*" -x "dev-frame/*" -x "content/dev-frame.bundle.js"
popd
