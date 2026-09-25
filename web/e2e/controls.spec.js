import { expect, test } from "@playwright/test";
import {
  advance,
  answerQuestion,
  clickFilter,
  expectQuestion,
  loadCatalog,
  loadExam,
  openFresh,
  openMenu,
  setLang,
} from "./helpers.js";

const CALC_KEYS = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+", "C"];

async function exerciseBuild(page, question) {
  const [first, second] = question.correct;
  await page.locator(`[data-action="build-add"][data-choice="${first}"]`).click();
  await page.locator(`[data-action="build-add"][data-choice="${second}"]`).click();
  await page.locator('[data-action="build-down"][data-index="0"]').click();
  await page.locator('[data-action="build-up"][data-index="1"]').click();
  await page.locator('[data-action="build-remove"][data-index="1"]').click();
  await page.locator('[data-action="build-remove"][data-index="0"]').click();
  await page.locator('[data-action="clear"]').click();
}

async function exerciseDrag(page, question) {
  const target = question.targets[0];
  const sourceId = question.correct[target.id];
  await page.locator(`[data-source="${sourceId}"]`).dragTo(page.locator(`[data-drop="${target.id}"]`));
  await expect(page.locator(`select[data-target="${target.id}"]`)).toHaveValue(sourceId);
}

async function exerciseTabs(page, question) {
  for (const exhibit of question.exhibits) {
    await page.locator(`[data-action="tab"][data-tab="${exhibit.id}"]`).click();
    await expect(page.locator('[data-action="tab"][data-tab="' + exhibit.id + '"]')).toHaveAttribute("aria-selected", "true");
  }
  await page.locator('[data-action="tab"][data-tab="question"]').click();
}

async function exerciseCase(page, section) {
  for (const topic of section.case.topics) {
    await page.locator(`[data-action="case-topic"][data-topic="${topic.id}"]`).click();
    await expect(page.locator("#question-heading")).toContainText(topic.title);
    await page.locator('[data-action="case-back"]').click();
    await expectQuestion(page, section.questions[0]);
  }
  for (let index = 0; index < section.questions.length; index += 1) {
    await page.locator(`[data-action="case-q"][data-index="${index}"]`).click();
    if (await page.locator("#modal-yes").isVisible()) await page.locator("#modal-yes").click();
  }
  await page.locator('[data-action="case-q"][data-index="0"]').click();
  if (await page.locator("#modal-yes").isVisible()) await page.locator("#modal-yes").click();
  await expectQuestion(page, section.questions[0]);
}

async function pickTheme(page, theme) {
  await openMenu(page, "colorSchemeLinks");
  await page.locator(`[data-action="theme"][data-theme="${theme}"]`).click();
}

test("tous les contrôles rendus", async ({ page }) => {
  const exam = loadExam("fr");
  const catalog = loadCatalog();
  await openFresh(page);
  await setLang(page, "fr");

  const unavailable = page.locator('[data-action="unavailable"]');
  await expect(unavailable).toHaveCount(catalog.cards.filter((card) => !card.available).length);
  const unavailableCount = await unavailable.count();
  for (let index = 0; index < unavailableCount; index += 1) {
    const toast = await unavailable.nth(index).evaluate((node) => {
      node.click();
      return document.querySelector(".toast")?.textContent || "";
    });
    expect(toast).toContain("Seul AZ-900 est ouvert");
  }

  const toggle = page.locator("#MenuToggle");
  const expanded = await toggle.getAttribute("aria-expanded");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", expanded === "true" ? "false" : "true");

  await setLang(page, "en");
  await setLang(page, "fr");

  await pickTheme(page, "dark-mode");
  await expect(page.locator("html")).toHaveClass(/dark-mode/);
  await pickTheme(page, "yellow-on-black");
  await expect(page.locator("html")).toHaveClass(/yellow-on-black/);
  await pickTheme(page, "default");
  await expect(page.locator("html")).not.toHaveClass(/dark-mode|yellow-on-black/);

  await page.locator('[data-action="open"]').click();
  await page.locator("#Back").click();
  await expect(page.locator('[data-action="open"]')).toBeVisible();
  await page.locator('[data-action="open"]').click();
  await page.locator('[data-action="to-ready"]').click();
  await page.locator('[data-action="to-intro"]').click();
  await page.locator('[data-action="to-ready"]').click();
  await page.locator('[data-action="begin"]').click();

  const first = exam.sections[0].questions[0];
  await expectQuestion(page, first);
  await expect(page.locator("#Back")).toBeDisabled();
  await page.locator('input[data-choice="A"]').check();
  await page.locator('[data-action="clear"]').click();
  await expect(page.locator('input[data-choice="A"]')).not.toBeChecked();
  await page.locator("#Mark").check();
  await expect(page.locator("#Mark")).toBeChecked();
  await page.locator("#Help").click();
  await expect(page.locator("#modal-title")).toBeVisible();
  await page.locator('[data-action="modal-no"]').click();
  await expect(page.locator("#alertContainer")).toHaveCount(0);
  await page.locator("#Next").click();
  await expect(page.locator("#modal-yes")).toBeVisible();
  await page.locator('[data-action="modal-no"]').click();
  await expectQuestion(page, first);
  await page.locator("#Next").click();
  await page.locator("#modal-yes").click();

  const second = exam.sections[0].questions[1];
  await expectQuestion(page, second);
  await page.locator("#Back").click();
  await page.locator("#modal-yes").click();
  await expectQuestion(page, first);
  await page.locator("#Next").click();
  await page.locator("#modal-yes").click();
  await answerQuestion(page, second);

  await page.locator("#MainMenu").click();
  await expect(page.locator("#modal-yes")).toBeVisible();
  await page.locator('[data-action="modal-no"]').click();
  await expectQuestion(page, second);

  await page.locator("#TakeBreak").click();
  await page.locator('[data-action="modal-no"]').click();
  await expectQuestion(page, second);
  await page.locator("#TakeBreak").click();
  await page.locator("#modal-yes").click();
  await expectQuestion(page, second);

  await page.locator("#Calculator").click();
  for (const key of CALC_KEYS) {
    await page.locator(`aside.sb-calc [data-action="calc-key"][data-key="${key}"]`).click();
  }
  await page.locator('aside.sb-calc [data-action="calc-key"][data-key="C"]').click();
  await page.locator('aside.sb-calc [data-action="calc-key"][data-key="1"]').click();
  await page.locator('aside.sb-calc [data-action="calc-key"][data-key="+"]').click();
  await page.locator('aside.sb-calc [data-action="calc-key"][data-key="2"]').click();
  await page.locator('aside.sb-calc [data-action="calc-key"][data-key="="]').click();
  await expect(page.locator("aside.sb-calc output")).toHaveText("3");
  await page.locator('aside.sb-calc [data-action="calc"]').click();
  await expect(page.locator("aside.sb-calc")).toHaveCount(0);

  const timer = page.locator('[data-toggle="timer"]');
  await timer.click();
  await expect(page.locator('[data-toggle="timer"]')).toHaveAttribute("aria-checked", "false");
  await page.locator('[data-toggle="timer"]').click();
  await expect(page.locator('[data-toggle="timer"]')).toHaveAttribute("aria-checked", "true");
  await page.locator('[data-toggle="progress"]').click();
  await expect(page.locator('[data-toggle="progress"]')).toHaveAttribute("aria-checked", "false");
  await page.locator('[data-toggle="progress"]').click();

  await openMenu(page, "ExamProgressMap");
  await page.locator('[data-action="submenu"][data-menu="ExamProgressMap"]').click();
  await expect(page.locator('[data-action="submenu"][data-menu="ExamProgressMap"]')).toHaveAttribute("aria-expanded", "false");

  for (const filter of ["all", "answered", "unanswered", "marked"]) {
    await clickFilter(page, filter);
    await expect(page.locator('[data-action="ask-submit"]')).toBeVisible();
  }
  await page.locator('[data-action="return"]').click();
  await expectQuestion(page, second);

  let sawBuild = false;
  let sawDrag = false;
  let sawTabs = false;
  const [independent, caseSection] = exam.sections;
  for (const [section, from] of [[independent, 1], [caseSection, 0]]) {
    for (let index = from; index < section.questions.length; index += 1) {
      const question = section.questions[index];
      await expectQuestion(page, question);
      if (!sawBuild && question.type === "build") {
        sawBuild = true;
        await exerciseBuild(page, question);
      }
      if (!sawDrag && question.type === "drag") {
        sawDrag = true;
        await exerciseDrag(page, question);
      }
      if (!sawTabs && (question.type === "yesno" || question.type === "exhibit")) {
        sawTabs = true;
        await exerciseTabs(page, question);
      }
      await answerQuestion(page, question);
      if (section.case && index === 0) await exerciseCase(page, section);
      await advance(page, section, index);
    }
  }

  await expect(page.locator('[data-action="ask-submit"]')).toBeVisible();
  for (const filter of ["all", "answered", "unanswered", "marked"]) {
    await clickFilter(page, filter);
  }
  await clickFilter(page, "all");
  await page.locator('[data-action="jump"]:not([disabled])').first().click();
  await expect(page.locator("#question-heading")).toBeVisible();
  await clickFilter(page, "all");
  await page.locator('[data-action="return"]').click();
  await expect(page.locator("#question-heading")).toBeVisible();
  await clickFilter(page, "all");
  await page.locator('[data-action="ask-submit"]').click();
  await expect(page.locator("#modal-yes")).toBeVisible();
  await page.locator('[data-action="modal-no"]').click();
  await expect(page.locator('[data-action="ask-submit"]')).toBeVisible();
  await expect(page.locator("p.score")).toHaveCount(0);
});
