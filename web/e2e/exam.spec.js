import { test } from "@playwright/test";
import { runExam } from "./helpers.js";

test("français, 40/40", async ({ page }) => {
  await runExam(page, "fr");
});

test("anglais, 40/40", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "le mobile rejoue le français");
  await runExam(page, "en");
});
