/* eslint-env node */

module.exports = function (api) {
  const presets = [
    [
      "@babel/preset-env",
      // We don't want es modules to be bundled; we'll use native loading!
      {
        targets: { browsers: "Firefox >= 78.0" },
        modules: false,
      },
    ],
    [
      "@babel/preset-react",
      {
        development: process.env.BABEL_ENV === "development",
      },
    ],
  ];

  const plugins = [];

  api.cache(true);

  return {
    presets,
    plugins,
  };
};
