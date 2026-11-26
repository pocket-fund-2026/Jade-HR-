// Deploy gate: catches undefined identifiers / missing imports (the cause of the
// 2026-11-26 white page). Deliberately minimal; not a style linter.
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/**", "node_modules/**", "harness.html"] },
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, __BUILD_ID__: "readonly" },
    },
    rules: {
      "no-undef": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-uses-vars": "error",
    },
  },
  {
    files: ["src/**/*.test.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
];
