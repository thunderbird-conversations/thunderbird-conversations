Releasing a new version
=======================

* Ensure L10n is up to date
* Ensure the correct changeset is checked out
* Ensure `npm ci` has been run
* Ensure `npm test` has been run
* Ensure the build runs in the expected versions of Thunderbird
* Run `npm version <version>` (see below for details on `<version>`)
* Push the branch `git push upstream <branch>`
* Push the tag `git push upstream v<version>`

`<version>` is an major/minor/patch version number, with a possible pre-release
tag, e.g.

* 2.14.0
* 3.0.0
* 3.0.0-pre1
* 3.0.0-pre2
* etc.

It can also be just `patch`, `minor` or `major` depending on the release.

Lastly:

* Check that the xpi installs in Thunderbird and is the correct version
* Upload the xpi to the add-ons site.

Note: `npm run prod` is automatically run by the postversion npm routine.
