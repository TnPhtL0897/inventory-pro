const libraryConfig = require("./library.js");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...libraryConfig,
  {
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
