/** @type {import("eslint").Linter.Config} */
const config = {
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": true
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked"
  ],
  "rules": {
    "@typescript-eslint/array-type": "off",
    "@typescript-eslint/consistent-type-definitions": "off",
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      {
        "prefer": "type-imports",
        "fixStyle": "inline-type-imports"
      }
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        "argsIgnorePattern": "^_"
      }
    ],
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/require-await": "off",
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-unsafe-return": "off",
    "@typescript-eslint/prefer-optional-chain": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    "@typescript-eslint/prefer-regexp-exec": "off",
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        "checksVoidReturn": {
          "attributes": false
        }
      }
    ],
    // Custom rules to enforce styling guidelines
    "no-restricted-syntax": [
      "error",
      {
        "selector": "Literal[value=/^#[0-9A-Fa-f]{3,8}$/]",
        "message": "Hardcoded hex colors are not allowed. Use CSS variables or Tailwind classes from docs/styling-architecture.md"
      },
      {
        "selector": "TemplateElement[value.raw=/\\b(bg|text|border)-\\[#[0-9A-Fa-f]{3,8}\\]/]",
        "message": "Hardcoded Tailwind colors are not allowed. Use semantic color classes from docs/styling-architecture.md"
      }
    ]
  },
  "ignorePatterns": [
    "src/test/**/*",
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "**/__tests__/**"
  ]
}
module.exports = config;