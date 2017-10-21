#!/bin/bash

ADDON="."

# In the PACKAGE_VERSION below we:
# - parse package.json
# - get the lines with version in
# - reduce to just the first of those lines
# - strip out space, " and ,
# - get the real version number (e.g. version:0.1.0 -> 0.1.0)
# - change 0.1.0-pre to 0.1.0pre for AMO compatiblity
PACKAGE_VERSION=`grep -m1 version package.json | \
	cut -d'"' -f4 | \
	sed 's/-pre/pre/'`

echo ${PACKAGE_VERSION}

# Ubuntu's version of sed doesn't have -i
sed -e "s/<em:version>.*<\/em:version>/<em:version>${PACKAGE_VERSION}<\/em:version>/" \
    ${ADDON}/install.rdf > ${ADDON}/install.rdf.gen
mv ${ADDON}/install.rdf.gen ${ADDON}/install.rdf
# Add package.json for the case where `npm version` is used with
# `--no-git-tag-version` - to make it easier to commit.
git add ${ADDON}/install.rdf
