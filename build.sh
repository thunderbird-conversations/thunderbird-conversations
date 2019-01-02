#!/bin/sh
NOT='.sh$|^.git|^tests|^.eslint|^.travis|^package.json$|^package-lock.json$'
VENDOR_DIR=content/vendor

mkdir -p $VENDOR_DIR
rm -r $VENDOR_DIR/*.*
cp node_modules/react/umd/react.production.min.js $VENDOR_DIR/react.js
cp node_modules/react-dom/umd/react-dom.production.min.js $VENDOR_DIR/react-dom.js
cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR
cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR

git ls-files | egrep -v $NOT > files
for a in $(cd modules/stdlib && git ls-files | egrep -v $NOT); do
  echo modules/stdlib/$a >> files
done

for a in $(cd $VENDOR_DIR && ls); do
  echo $VENDOR_DIR/$a >> files
done

rm conversations.xpi
zip conversations.xpi $(cat files)
rm files
