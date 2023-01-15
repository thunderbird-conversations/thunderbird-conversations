# Development

## Branches

We always try to ensure support with the currently released major version of
Thunderbird. Where a new version is close to release, we try to support that
as well.

Each major release of conversations typically has a release branch for that
release (e.g. 3.1+). However, all changes should be landed on the master
branch, and we may then decide to back-port them to the current release branch.

## Building

1. Clone the repository
2. Run `npm ci`
3. Run `npm run build`

You will need to do the last step every time you change something.

## Running in Thunderbird

Note: At the moment when making changes, especially to the modules, it is best
to load the add-on via temporary mode, and restart Thunderbird which each change.

1. Start Thunderbird
2. Go to the three-bar menu -> Tools -> Developer Tools -> Debug Add-ons
3. Select Load Temporary Add-on
4. Navigate to the `dist` directory and select any file there.

## Debugging in Thunderbird

If you go into the preferences for Conversations (found under Add-ons), you can
turn on "Debugging" to enable output.

This can be viewed in the Error Console, available under the three-bar menu ->
Tools -> Developer Tools. Note, you may need to click the cog in the top-right
corner, and enable "Show Content Messages" for the messages to show up.

The Developer Toolbox, found in the same location, is also very useful for
debugging.

## Development in the Browser

Some `thunderbird-conversations` components can be developed fully in the browser. To build these components do

```
$ npm run dev
```

and then browse to http://localhost:8126 and select a browser-compatible
component file. For example, http://localhost:8126/options/options.html

`npm run dev` will copy/compile all source files to the `build-dev-html`;
it continues to watch files for changes and will automatically recopy/recompile
files that change.

### Missing Thunderbird APIs

The browser lacks some of Thunderbird's APIs. These are mocked in
`addon/content/esmodules/thunderbirdCompat.js`. All components may import
from `thunderbirdCompat.js`, which will use native APIs if available, otherwise
fall back to mocked APIs.

### Module Importing

`thunderbird-conversations` uses native ESM module importing (e.g. `import { x } from "y.js"`).

## Testing

`thunderbird-conversations` has linting tests and [jest](https://jestjs.io) tests. To run all tests, do

```
$ npm test
```

To run just the _jest_ tests, do

```
$ npm run test:jest
```

Tests are stored in `test` directories. Because native ESM modules are used while
tests are preformed on Node.js (which defaults to CJS modules), some care must be
taken when importing. Please see existing tests for details.
