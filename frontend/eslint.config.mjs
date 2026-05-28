import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 既存の設定から next-env.d.ts を無視するルールを取り除く
const filterIgnores = (configs) => {
  return configs.map(config => {
    if (config.ignores) {
      return {
        ...config,
        ignores: config.ignores.filter(item => item !== "next-env.d.ts")
      };
    }
    return config;
  });
};

const eslintConfig = defineConfig([
  ...filterIgnores(nextVitals),
  ...filterIgnores(nextTs),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
  ]),
]);

export default eslintConfig;
