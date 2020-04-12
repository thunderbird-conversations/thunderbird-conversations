Development
===========

Building
--------

1. Clone the repository
2. Change into the main folder, run `git submodule update --init`
3. Run `npm ci`
4. Run `npm run build`

You will need to do the last step every time you change something.

Running in Thunderbird
----------------------

Note: At the moment when making changes, espeically to the modules, it is best
to load the add-on via temporary, and restart Thunderbird which each change.

1. Start (or restart) Thunderbird with `$ /path/to/thunderbird -purgecaches`
2. Go to three-bar menu -> Tools -> Developer Tools -> Debug Add-ons
3. Select Load Temporary Add-on
4. Navigate to the `dist` directory and select a file there.

Development in the Browser
--------------------------

Some `thunderbird-conversations` components can be developed fully in the browser. To build these components do

```
$ npm run dev
```

and then browse to http://localhost:8126 and select a browser-compatible
component file. For example, http://localhost:8126/options.html  

`npm run dev` will copy/compile all source files to the `build-dev-html`;
it continues to watch files for changes and will automatically recopy/recompile
files that change.

### Missing Thunderbird APIs

The browser lacks some of Thunderbird's APIs. These are mocked in
`addon/content/es-modules/thunderbird-compat.js`. All components may import
from `thunderbird-compat.js`, which will use native APIs if available, otherwise
fall back to mocked APIs.

### Module Importing

`thunderbird-conversations` uses native ESM module importing (e.g. `import { x } from "y.js"`).
These imports are not transpiled and must reference actual files. Because of the difficulty
in importing UMD modules with as native ESM modules, a wrapper module has been created:
`addon/content/es-modules/ui.js`. From `ui.js`, you can import `React` and friends. Since
modules are only loaded once, you can import from `ui.js` multiple times and will always get
the same copy of `React`.

Testing
-------

`thunderbird-conversations` has linting tests and [jest](https://jestjs.io) tests. To run all tests, do

```
$ npm test
```

To run just the *jest* tests, do

```
$ npm test:jest
```

Tests are stored in `test` directories. Because native ESM modules are used while
tests are preformed on Node.js (which defaults to CJS modules), some care must be
taken when importing. Please see existing tests for details.
