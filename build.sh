#!/bin/sh
NOT='.sh$|^.git|^tests'
PDFJS=content/pdfjs/build/pdf.js
PDFWORKERJS=content/pdfjs/build/pdf.worker.js

git ls-files | egrep -v $NOT > files
for a in $(cd modules/stdlib && git ls-files | egrep -v $NOT); do
  echo modules/stdlib/$a >> files
done

if [ -f $PDFJS ]; then
  true;
else
  echo "Please run make from content/pdfjs";
  exit 1
fi
echo $PDFJS >> files
echo $PDFWORKERJS >> files

rm conversations.xpi
zip conversations.xpi $(cat files)
rm files
