#!/bin/sh
NOT='.sh$|^.git|.jsx$|^tests|^.eslint|^.travis|^package.json$|^package-lock.json$'
DIST=dist-dev-html
VENDOR_DIR=$DIST/content/vendor
ADDON_DIR=addon
DEV_SERVER_PORT=8126

rm -rf $DIST
mkdir -p $VENDOR_DIR
mkdir -p $DIST/content/modules/stdlib

cp node_modules/redux/dist/redux.js $VENDOR_DIR/redux.js
cp node_modules/react-redux/dist/react-redux.js $VENDOR_DIR/react-redux.js
cp node_modules/react/umd/react.development.js $VENDOR_DIR/react.js
cp node_modules/react-dom/umd/react-dom.development.js $VENDOR_DIR/react-dom.js
cp node_modules/prop-types/prop-types.min.js $VENDOR_DIR/prop-types.js
cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR
cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR
cp "node_modules/@reduxjs/toolkit/dist/redux-toolkit.umd.js" $VENDOR_DIR

cp LICENSE README.md $DIST/

pushd $ADDON_DIR

echo "    Watching JSX files"
for a in $(git ls-files | grep '.jsx$'); do
  echo "Watching $a"
  npx babel --watch --verbose --config-file=../babel.config.js $a --out-dir ../$DIST/$(dirname $a) &
done

echo "    Copying non-jsx files"
npx cpx "**/*.{js,html,xhtml,css,svg,png,gif,ico,dtd,properties,json}" ../${DIST}/ --watch --verbose &

popd

# This is a bit of a hack, but since all processes are being backgrounded, if
# we don't wait for them to finish, our user message will get burried
sleep 4

echo "    Starting dev server on localhost:${DEV_SERVER_PORT}"
npx serve -l ${DEV_SERVER_PORT} $DIST/ &
echo "    You can now navigate to localhost:${DEV_SERVER_PORT} to load"
echo "    a browser-compatible file. Any changes to the"
echo "    source will cause an automatic recompile."

wait $(jobs -p)
