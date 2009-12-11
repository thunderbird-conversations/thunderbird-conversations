all: debug_template package

release: release_template package

package: dist upload

dist:
	rm -f gconversation.xpi
	zip gconversation.xpi --exclude Makefile --exclude oldext --exclude tests --exclude TODO --exclude install.rdf.template -r *

upload:
	echo "cd jonathan/files\nput gconversation.xpi" | ftp xulforum@ftp.xulforum.org

debug_template:
	cp -f install.rdf.template install.rdf
	sed -i s/__REPLACEME__/\.$(shell date +%y%m%d)pre/ install.rdf

release_template:
	cp -f install.rdf.template install.rdf
	sed -i s/__REPLACEME__// install.rdf
