#!/bin/sh
DIST=dist-dev-html
VENDOR_DIR=$DIST/content/vendor
DEV_SERVER_PORT=8126

echo "    Starting dev server on localhost:${DEV_SERVER_PORT}"
npx serve -l ${DEV_SERVER_PORT} $DIST/ &
echo "    You can now navigate to localhost:${DEV_SERVER_PORT} to load"
echo "    a browser-compatible file. Any changes to the"
echo "    source will cause an automatic recompile."

wait $(jobs -p)
