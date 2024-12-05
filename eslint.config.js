const globals = require("globals")
const pluginJs = require("@eslint/js")

module.exports = [
  {
    rules: {
      "no-console": 2,
      "prefer-const": 2,
    }
  },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended
]
