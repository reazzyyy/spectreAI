/** @type {import("stylelint").Config} */
export default {
  extends: ["stylelint-config-standard-scss", "stylelint-config-pretty-order"],
  ignoreFiles: [
    "**/node_modules/**",
    "**/.next/**",
    // Pre-D-024 CSS Modules (system-map); migrate in a later chore slice.
    "**/widgets/system-map/**",
  ],
  rules: {
    "selector-class-pattern": null,
    "custom-property-pattern": null,
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
