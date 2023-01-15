# Vendor files

The files within the packaged add-on in the `content/vendor/` directory are
from third parties.

Each add-on release is tagged with its version number, e.g. `2.15.5` is tagged
with `v2.15.5`. These are listed on the releases page.

The third party packages and their versions are listed in the top-level
`package.json`. The packages are obtained by using `npm ci` run in the top-level
directory, and then `scripts/build.sh` is used to copy the vendor files out of
`node_modules/` sub-directories by build.sh.

The original repositories and their relevant npmjs hosting locations are given
below:

- https://github.com/facebook/prop-types
  - https://www.npmjs.com/package/prop-types
- https://github.com/facebook/react
  - https://www.npmjs.com/package/react
  - https://www.npmjs.com/package/react-dom
- https://github.com/reduxjs/react-redux
  - https://www.npmjs.com/package/react-redux
- https://github.com/reduxjs/redux
  - https://www.npmjs.com/package/redux
- https://github.com/reduxjs/redux-toolkit
  - https://www.npmjs.com/package/@reduxjs/redux-toolkit
