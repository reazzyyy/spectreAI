/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard-scss", "stylelint-config-pretty-order"],
  ignoreFiles: ["**/node_modules/**", "**/.next/**"],
  rules: {
    "selector-class-pattern": null,
    "custom-property-pattern": null,
    // CSS Modules + BEM-ish modifiers create false positives with nested .collapsed/.active.
    "no-descending-specificity": null,
    "selector-not-notation": null,
    "value-keyword-case": [
      "lower",
      {
        ignoreKeywords: ["Consolas", "Segoe", "UI", "Cascadia", "Code"],
        ignoreProperties: ["/font/", "/font-/"],
      },
    ],
    "scss/at-rule-no-unknown": true,
  },
};
