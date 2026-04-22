module.exports = {
  extends: ["stylelint-config-standard-scss"],
  ignoreFiles: ["scss/css/**/*.css"],
  rules: {
    "max-nesting-depth": 3,
    "selector-max-compound-selectors": 4,
    "no-descending-specificity": null,
    "scss/at-import-no-partial-leading-underscore": null,
  },
};
