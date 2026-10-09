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

/** Both spellings of an import into a layer: the alias, and a relative path that climbs into it. */
function into(...layers) {
  return layers.flatMap((name) => [`@/${name}/**`, `**/${name}/**`]);
}

/**
 * The dependency rule, enforced by the linter instead of by convention:
 *
 *   domain <- application <- adapters <- composition <- ui / app
 *
 * The UI reaches the core through the application gateway; adapters and fixtures are wired in
 * `src/composition` and nowhere else.
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

const CLOCK_MESSAGE =
  "Time comes from the Clock port so that every rule can be tested at a fixed instant.";

const WALL_CLOCK = [
  { selector: "MemberExpression[object.name='Date'][property.name='now']", message: CLOCK_MESSAGE },
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
  {
    selector: "MemberExpression[object.name='performance'][property.name='now']",
    message: CLOCK_MESSAGE,
  },
];

const RANDOM = {
  selector: "MemberExpression[object.name='Math'][property.name='random']",
  message: "Nothing here is random: every output has to be traceable to its input.",
};

// The clock adapters and the composition root are the only places that may read the wall clock.
const CLOCK_OWNERS = ["src/adapters/memory/**", "src/composition/**"];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layer(
    "domain",
    ["src/domain/**"],
    [
      ...into("application", "adapters", "fixtures", "composition", "ui", "app"),
      "zod",
      ...FRAMEWORKS,
    ],
    "The domain is plain TypeScript: no framework, no I/O, no outer layers.",
  ),
  layer(
    "application",
    ["src/application/**"],
    [...into("adapters", "fixtures", "composition", "ui", "app"), ...FRAMEWORKS],
    "Use cases depend on the domain and on ports, never on adapters or the UI.",
  ),
  layer(
    "adapters",
    ["src/adapters/**"],
    [...into("fixtures", "composition", "ui", "app"), ...FRAMEWORKS],
    "Adapters implement ports; they know nothing about the UI or the demo data.",
  ),
  layer(
    "fixtures",
    ["src/fixtures/**"],
    [...into("composition", "ui", "app"), ...FRAMEWORKS],
    "Fixtures are data: they may use the domain vocabulary and the operator emitters, nothing else.",
  ),
  layer(
    "composition",
    ["src/composition/**"],
    [...into("ui", "app"), ...FRAMEWORKS],
    "The composition root wires ports to adapters and stays framework-free.",
  ),
  layer(
    "ui",
    ["src/ui/**", "src/app/**"],
    into("adapters", "fixtures"),
    "The UI reaches the core through the gateway. Adapters are wired in src/composition only.",
  ),
  {
    name: "architecture/determinism",
    files: ["src/**"],
    ignores: [...TESTS, ...CLOCK_OWNERS],
    rules: { "no-restricted-syntax": ["error", ...WALL_CLOCK, RANDOM] },
  },
  {
    name: "architecture/no-random",
    files: CLOCK_OWNERS,
    ignores: TESTS,
    rules: { "no-restricted-syntax": ["error", RANDOM] },
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
