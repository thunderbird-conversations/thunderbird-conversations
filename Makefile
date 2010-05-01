#EXCLUDES = $(addprefix -x , $(shell find . -iname '.*.sw*'))
EXCLUDES = ignoreme $(shell find . -iname '.*.sw*')

all: debug_package

release_package: release_template package

debug_package: debug_template package

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
	zip gconversation.xpi gconv.jar chrome.manifest -r defaults/ modules/ icon.png install.rdf -x $(EXCLUDES)
	mv chrome.manifest chrome.manifest.release
	mv chrome.manifest.dev chrome.manifest

BRANCH = $(shell git branch | egrep "\\* (.*)" | cut -c 3-)
DATE = $(shell date +%Y%m%d%H%M)
FILENAME = "$(DATE)-$(BRANCH).xpi"

upload:
	echo "cd jonathan/files\nput gconversation.xpi gcv-nightlies/$(FILENAME)\n\
	      put Changelog gcv-nightlies/Changelog_$(BRANCH)" | ftp xulforum@ftp.xulforum.org

debug_template:
	sed s/__REPLACEME__/\.$(DATE)pre/ install.rdf.template > install.rdf

release_template:
	sed s/__REPLACEME__// install.rdf.template > install.rdf
