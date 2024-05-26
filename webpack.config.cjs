/* eslint-env node */
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

const development = process.env.NODE_ENV === "development";
module.exports = {
  devtool: development ? "source-map" : false,
  entry: {
    compose: "./addon/compose/composeRender.js",
    gallery: "./addon/gallery/gallery.mjs",
    options: "./addon/options/optionsRender.js",
    stub: "./addon/content/stub.js",
    "dev-frame": "./addon/dev-frame/dev-frame-render.js",
  },
  mode: "none",
  optimization: {
    minimize: false,
    splitChunks: {
      name: false,
      chunks: "all",
      minChunks: 1,
    },
  },
  output: {
    path: path.resolve(__dirname, "dist", "content"),
    filename: "[name].bundle.js",
  },
  plugins: [
    new HtmlWebpackPlugin({
      hash: false,
      template: "./addon/compose/compose.html",
      chunks: ["compose"],
      filename: "../compose/compose.html",
    }),
    new HtmlWebpackPlugin({
      hash: false,
      template: "./addon/gallery/index.html",
      chunks: ["gallery"],
      filename: "../gallery/index.html",
    }),
    new HtmlWebpackPlugin({
      hash: false,
      template: "./addon/options/options.html",
      chunks: ["options"],
      filename: "../options/options.html",
    }),
    new HtmlWebpackPlugin({
      hash: false,
      template: "./addon/content/stub.html",
      chunks: ["stub"],
      filename: "stub.html",
    }),
    new HtmlWebpackPlugin({
      hash: false,
      template: "./addon/content/standalone.html",
      chunks: ["stub"],
      filename: "standalone.html",
    }),
    new HtmlWebpackPlugin({
      hash: false,
      template: "./addon/dev-frame/dev-frame.html",
      chunks: ["dev-frame"],
      filename: "../dev-frame/dev-frame.html",
    }),
  ],
  resolve: {
    extensions: [".js", ".mjs"],
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },
};
