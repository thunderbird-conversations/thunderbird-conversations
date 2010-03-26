#EXCLUDES = $(addprefix -x , $(shell find . -iname '.*.sw*'))
EXCLUDES = ignoreme $(shell find . -iname '.*.sw*')

all: debug_template package upload

release: release_template package upload

package: jarify dist

clean:
	rm -f gconv.jar gconversation.xpi install.rdf

jarify:
	rm -f gconv.jar
	zip gconv.jar -r content/ skin/ locale/ -x $(EXCLUDES)

dist:
	rm -f gconversation.xpi
	mv chrome.manifest chrome.manifest.dev
	mv chrome.manifest.release chrome.manifest
	zip gconversation.xpi gconv.jar chrome.manifest -r defaults/ modules/ icon.png install.rdf
	mv chrome.manifest chrome.manifest.release
	mv chrome.manifest.dev chrome.manifest

upload:
	echo "cd jonathan/files\nput gconversation.xpi\nput Changelog Changelog_GConversation" | ftp xulforum@ftp.xulforum.org

debug_template:
	sed s/__REPLACEME__/\.$(shell date +%y%m%d)pre/ install.rdf.template > install.rdf

release_template:
	sed s/__REPLACEME__// install.rdf.template > install.rdf
