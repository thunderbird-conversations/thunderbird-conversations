/* eslint-env node */

module.exports = function(api) {
  const presets = [
    [
      "@babel/preset-env",
    ], [
      "@babel/preset-react", {
        development: process.env.BABEL_ENV === "development",
      },
    ],
  ];

  const plugins = [ ];

  api.cache(true);

  return {
    presets,
    plugins,
  };
};
