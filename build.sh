#!/bin/sh
NOT='.sh$|^.git|.jsx$|^tests|^.eslint|^.travis|^package.json$|^package-lock.json$'
DIST=dist
VENDOR_DIR=$DIST/content/vendor

rm -rf $DIST
mkdir -p $VENDOR_DIR
mkdir -p $DIST/modules/stdlib

cp node_modules/react/umd/react.production.min.js $VENDOR_DIR/react.js
cp node_modules/react-dom/umd/react-dom.production.min.js $VENDOR_DIR/react-dom.js
cp node_modules/prop-types/prop-types.min.js $VENDOR_DIR/prop-types.js
cp node_modules/pdfjs-dist/build/pdf.js $VENDOR_DIR
cp node_modules/pdfjs-dist/build/pdf.worker.js $VENDOR_DIR

git ls-files | egrep -v $NOT > files

for a in $(git ls-files | grep '.jsx$'); do
  echo $a
  babel $a --out-dir $DIST/$(dirname $a)
  echo ${a%.*}.js >> files
done

for a in $(git ls-files | egrep -v $NOT | egrep -v '^modules/stdlib'); do
  mkdir -p $(dirname "${DIST}/${a}")
  cp $a $DIST/$a
done

for a in $(cd modules/stdlib && git ls-files | egrep -v $NOT); do
  if [ $a != "" ]; then
    cp modules/stdlib/$a $DIST/modules/stdlib
    echo modules/stdlib/$a >> files
  fi
done

for a in $(cd $VENDOR_DIR && ls); do
  echo content/vendor/$a >> files
done

rm -f conversations.xpi
pushd dist
zip ../conversations.xpi $(cat ../files)
popd
rm files
