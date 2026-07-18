const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

const development = process.env.NODE_ENV === "development";
module.exports = {
  devtool: development ? "source-map" : false,
  entry: {
    stub: "./addon/experiment-api/stub.mjs",
    "dev-frame": "./addon/dev-frame/dev-frame-render.mjs",
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
      template: "./addon/experiment-api/stub.html",
      chunks: ["stub"],
      filename: "../experiment-api/stub.html",
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
};
