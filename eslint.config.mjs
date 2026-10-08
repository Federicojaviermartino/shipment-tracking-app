import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const FRAMEWORKS = [
  "react",
  "react-dom",
  "react-dom/*",
  "next",
  "next/*",
  "@tanstack/*",
  "radix-ui",
  "lucide-react",
];

const TESTS = ["**/*.test.ts", "**/*.test.tsx"];

/**
 * The dependency rule, enforced by the linter instead of by convention:
 *
 *   domain <- application <- adapters <- composition <- ui / app
 *
 * The UI talks to the application gateway only; adapters and fixtures are
 * wired in `src/composition` and nowhere else.
 */
function layer(name, files, forbidden, message) {
  return {
    name: `architecture/${name}`,
    files,
    ignores: TESTS,
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: forbidden, message }] }],
    },
  };
}

const WALL_CLOCK = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Time comes from the Clock port so that every rule can be tested at a fixed instant.",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "Time comes from the Clock port so that every rule can be tested at a fixed instant.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layer(
    "domain",
    ["src/domain/**"],
    [
      "@/application/**",
      "@/adapters/**",
      "@/fixtures/**",
      "@/composition/**",
      "@/ui/**",
      "@/app/**",
      "zod",
      ...FRAMEWORKS,
    ],
    "The domain is plain TypeScript: no framework, no I/O, no outer layers.",
  ),
  layer(
    "application",
    ["src/application/**"],
    ["@/adapters/**", "@/fixtures/**", "@/composition/**", "@/ui/**", "@/app/**", ...FRAMEWORKS],
    "Use cases depend on the domain and on ports, never on adapters or the UI.",
  ),
  layer(
    "adapters",
    ["src/adapters/**"],
    ["@/fixtures/**", "@/composition/**", "@/ui/**", "@/app/**", ...FRAMEWORKS],
    "Adapters implement ports; they know nothing about the UI or the demo data.",
  ),
  layer(
    "fixtures",
    ["src/fixtures/**"],
    ["@/composition/**", "@/ui/**", "@/app/**", ...FRAMEWORKS],
    "Fixtures are data: they may use the domain vocabulary and the operator emitters, nothing else.",
  ),
  layer(
    "composition",
    ["src/composition/**"],
    ["@/ui/**", "@/app/**", ...FRAMEWORKS],
    "The composition root wires ports to adapters and stays framework-free.",
  ),
  layer(
    "ui",
    ["src/ui/**", "src/app/**"],
    ["@/adapters/**", "@/fixtures/**"],
    "The UI talks to the application gateway. Adapters are wired in src/composition only.",
  ),
  {
    name: "architecture/no-wall-clock",
    files: ["src/domain/**", "src/application/**", "src/fixtures/**", "src/ui/**", "src/app/**"],
    ignores: TESTS,
    rules: { "no-restricted-syntax": ["error", ...WALL_CLOCK] },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    ".tmp/**",
  ]),
]);

export default eslintConfig;
