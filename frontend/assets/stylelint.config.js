module.exports = {
  extends: ["stylelint-config-standard-scss"],
  ignoreFiles: ["scss/css/**/*.css"],
  rules: {
    "max-nesting-depth": 4,
    "selector-max-compound-selectors": 6,

    "no-descending-specificity": null,
    "selector-class-pattern": null,
    "selector-id-pattern": null,
    "keyframes-name-pattern": null,
    "no-empty-source": null,
    "block-no-empty": null,
    "font-family-no-duplicate-names": null,
    "declaration-block-no-shorthand-property-overrides": null,
    "no-duplicate-selectors": null,

    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["moz-focus-inner"],
      },
    ],

    "scss/at-import-no-partial-leading-underscore": null,
  },
};
