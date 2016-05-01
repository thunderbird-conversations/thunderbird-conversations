#!/bin/sh
NOT='.sh$|^.git|^tests'
PDFJS=content/pdfjs/build/pdf.js

git ls-files | egrep -v $NOT > files
for a in $(cd modules/stdlib && git ls-files | egrep -v $NOT); do
  echo modules/stdlib/$a >> files
done

if [ -f "content/pdfjs/build/pdf.js" ]; then
  true;
else
  echo "Please run make from content/pdfjs";
  exit 1
fi
echo $PDFJS >> files

rm conversations.xpi
zip conversations.xpi $(cat files)
rm files
