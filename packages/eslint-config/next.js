const libraryConfig = require("./library.js");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  ...libraryConfig,
  {
    extends: ["next/core-web-vitals", "next/typescript"],
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-img-element": "warn",
    },
  },
];
