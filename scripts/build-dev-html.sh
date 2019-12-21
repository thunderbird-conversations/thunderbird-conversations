#!/bin/sh
NOT='.sh$|^.git|.jsx$|^tests|^.eslint|^.travis|^package.json$|^package-lock.json$'
DIST=dist-dev-html
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon
DEV_SERVER_PORT=8126

WATCH_FLAG=""
if [ $1 = "--watch" ]
then
  echo "Watching files for changes with --watch"
  WATCH_FLAG="--watch"
fi

rm -rf $DIST
mkdir -p $VENDOR_DIR
mkdir -p $DIST/content/modules/stdlib

# disable CJS-style module loading for specific vendor scripts
# Instead of directly copying, we prepend some Javascript
cat other/disable-cjs-module.js >> $VENDOR_DIR/redux.js
cat node_modules/redux/dist/redux.js >> $VENDOR_DIR/redux.js
cat other/disable-cjs-module.js >> $VENDOR_DIR/react-redux.js
cat node_modules/react-redux/dist/react-redux.js >> $VENDOR_DIR/react-redux.js
cat other/disable-cjs-module.js >> $VENDOR_DIR/react.js
cat node_modules/react/umd/react.development.js >> $VENDOR_DIR/react.js
cat other/disable-cjs-module.js >> $VENDOR_DIR/react-dom.js
cat node_modules/react-dom/umd/react-dom.development.js >> $VENDOR_DIR/react-dom.js
cat other/disable-cjs-module.js >> $VENDOR_DIR/prop-types.js
cat node_modules/prop-types/prop-types.min.js >> $VENDOR_DIR/prop-types.js
cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR
cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR
cat other/disable-cjs-module.js >> $VENDOR_DIR/redux-toolkit.umd.js
cat "node_modules/@reduxjs/toolkit/dist/redux-toolkit.umd.js" >> $VENDOR_DIR/redux-toolkit.umd.js

cp LICENSE README.md $DIST/

pushd $ADDON_DIR

echo "    Watching JSX files"
for a in $(git ls-files | grep '.jsx$'); do
  echo "Compiling $a"
  npx babel --verbose --config-file=../babel.config.js $a --out-dir ../$DIST/$(dirname $a) $WATCH_FLAG &
done

echo "    Copying non-jsx files"
npx cpx "**/*.{js,html,xhtml,css,svg,png,gif,ico,dtd,properties,json}" ../${DIST}/ --verbose $WATCH_FLAG &

popd

wait $(jobs -p)
