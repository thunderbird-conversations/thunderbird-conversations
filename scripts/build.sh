#!/bin/sh
NOT='.sh$|^.git|.jsx$|.js$|^tests|^.eslint|^.travis|^package.json$|^package-lock.json$|^.prettierrc'
DIST=dist
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon

rm -rf $DIST
mkdir -p $VENDOR_DIR
mkdir -p $DIST/content/modules/stdlib

if [ "$1" == "--prod" ]
then
  cp node_modules/redux/dist/redux.min.js $VENDOR_DIR/redux.js
  cp node_modules/react-redux/dist/react-redux.min.js $VENDOR_DIR/react-redux.js
  cp node_modules/react/umd/react.production.min.js $VENDOR_DIR/react.js
  cp node_modules/react-dom/umd/react-dom.production.min.js $VENDOR_DIR/react-dom.js
  cp node_modules/prop-types/prop-types.min.js $VENDOR_DIR/prop-types.js
  cp "node_modules/@reduxjs/toolkit/dist/redux-toolkit.umd.min.js" $VENDOR_DIR/redux-toolkit.umd.js
  cp node_modules/pdfjs-dist/build/pdf.min.js $VENDOR_DIR/pdf.js
  cp node_modules/pdfjs-dist/build/pdf.worker.min.js $VENDOR_DIR/pdf.worker.js
else
  cp node_modules/redux/dist/redux.js $VENDOR_DIR/redux.js
  cp node_modules/react-redux/dist/react-redux.js $VENDOR_DIR/react-redux.js
  cp node_modules/react/umd/react.development.js $VENDOR_DIR/react.js
  cp node_modules/react-dom/umd/react-dom.development.js $VENDOR_DIR/react-dom.js
  cp node_modules/prop-types/prop-types.js $VENDOR_DIR/prop-types.js
  cp "node_modules/@reduxjs/toolkit/dist/redux-toolkit.umd.js" $VENDOR_DIR/redux-toolkit.umd.js
  cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR/pdf.js
  cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR/pdf.worker.js
fi

cp LICENSE README.md $DIST/

pushd $ADDON_DIR

npx babel --config-file=../babel.config.js . --out-dir ../$DIST/ &

for a in $(git ls-files | egrep -v $NOT | egrep -v '^content/modules/stdlib'); do
  mkdir -p $(dirname "../${DIST}/${a}")
  cp $a ../$DIST/$a
done

popd

# The babel compilation was done in parallel. Wait for it to finish before packaging.
wait $(jobs -p)

rm -f conversations.xpi
pushd dist
zip -r ../conversations.xpi * -x "tests/*"
popd
