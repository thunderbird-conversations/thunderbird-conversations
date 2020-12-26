#!/bin/bash
NOT='.sh$|^.git|.jsx$|^tests|^.eslint|^.travis|^package.json$|^package-lock.json$'
DIST=dist-dev-html
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon
DEV_SERVER_PORT=8126

WATCH_FLAG=""
if [ "$1" = "--watch" ]
then
  echo "Watching files for changes with --watch"
  WATCH_FLAG="--watch"
fi

rm -rf $DIST
mkdir -p $VENDOR_DIR

cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR
cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR

cp LICENSE README.md $DIST/

echo "    Watching webpack files"
npx webpack --mode=development --watch --output-path=./${DIST}/content &

echo "    Copying non-jsx files"
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
cp content/utils.js ../$DIST/content/utils.js
cp content/stubGlobals.js ../$DIST/content/stubGlobals.js

popd

wait $(jobs -p)
