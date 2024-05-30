import test from "ava";
import results from "../results/root.report.json" with { type: "json" };

const assertThreshold = ({ score }, threshold) => (t) =>
  t.true(
    score >= threshold,
    `Score should be at least ${100 * threshold}%. Actual: ${100 * score}%`,
  );

test(
  "Lighthouse Accessibility",
  assertThreshold(results.categories.accessibility, 0.9),
);

test(
  "Lighthouse Best practices",
  assertThreshold(results.categories["best-practices"], 0.9),
);

test(
  "Lighthouse Performance",
  assertThreshold(results.categories.performance, 0.9),
);

test("Lighthouse SEO", assertThreshold(results.categories.seo, 0.9));
