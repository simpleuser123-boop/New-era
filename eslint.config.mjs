import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  // tmp/ holds generated artifacts and one-off collection tools; maintained scripts live in scripts/.
  {
    ignores: ["tmp/**"],
  },
  ...nextVitals,
  ...nextTs,
];

export default eslintConfig;
