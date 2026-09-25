import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";

export function loadExam(lang) {
  return JSON.parse(readFileSync(new URL(`../data/az-900/${lang}.json`, import.meta.url), "utf8"));
}

export function loadCatalog() {
  return JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"));
}

export async function openFresh(page) {
  await page.addInitScript(() => {
    sessionStorage.removeItem("az900-run");
    localStorage.removeItem("az-lang");
    localStorage.removeItem("az-theme");
  });
  await page.goto("/");
  await expect(page.locator('[data-action="open"]')).toBeVisible();
}

export async function setLang(page, lang) {
  const wanted = lang === "en" ? "en" : "fr";
  if ((await page.locator("html").getAttribute("lang")) !== wanted) {
    await page.locator("#DisplayLanguage").click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", wanted);
}

export async function expectQuestion(page, question) {
  await expect(page.locator("#question-heading")).toContainText(question.stem.slice(0, 80));
}

async function showQuestionTab(page, question) {
  if (question.type === "exhibit" || question.type === "yesno") {
    await page.locator('[data-action="tab"][data-tab="question"]').click();
  }
}

export async function answerQuestion(page, question) {
  await expectQuestion(page, question);
  await showQuestionTab(page, question);
  const correct = question.correct;
  if (question.type === "single" || question.type === "multi" || question.type === "exhibit") {
    for (const id of correct) {
      await page.locator(`input[data-choice="${id}"]`).check();
    }
  } else if (question.type === "hot") {
    for (const id of correct) {
      await page.locator(`[data-action="hot"][data-region="${id}"]`).click();
    }
  } else if (question.type === "build") {
    for (const id of correct) {
      await page.locator(`[data-action="build-add"][data-choice="${id}"]`).click();
    }
  } else if (question.type === "drag") {
    for (const target of question.targets) {
      await page.locator(`.bank [data-source="${correct[target.id]}"]`).click();
      await page.locator(`[data-drop="${target.id}"]`).click();
      await expect(page.locator(`[data-drop="${target.id}"] .chip`)).toContainText(
        question.sources.find((source) => source.id === correct[target.id]).text,
      );
    }
  } else if (question.type === "active") {
    for (const control of question.controls) {
      await page.locator(`select[data-control="${control.id}"]`).selectOption(correct[control.id]);
    }
  } else if (question.type === "yesno") {
    for (const statement of question.statements) {
      await page.locator(`input[data-statement="${statement.id}"][value="${correct[statement.id]}"]`).check();
    }
  } else {
    throw new Error(`Type de question inconnu : ${question.type}`);
  }
}

export async function advance(page, section, index) {
  await page.locator("#Next").click();
  if (index === section.questions.length - 1 && section.id === "independent") {
    await page.locator("#modal-yes").click();
  }
}

export async function openMenu(page, menu) {
  const button = page.locator(`[data-action="submenu"][data-menu="${menu}"]`);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

export async function clickFilter(page, filter) {
  await openMenu(page, "eqdLinks");
  await page.locator(`[data-action="review-filter"][data-filter="${filter}"]`).click();
}

export async function runExam(page, lang) {
  const exam = loadExam(lang);
  await openFresh(page);
  await setLang(page, lang);
  await page.locator('[data-action="open"]').click();
  await page.locator('[data-action="to-ready"]').click();
  await page.locator('[data-action="begin"]').click();
  for (const section of exam.sections) {
    for (let index = 0; index < section.questions.length; index += 1) {
      await answerQuestion(page, section.questions[index]);
      await advance(page, section, index);
    }
  }
  await expect(page.locator('[data-action="ask-submit"]')).toBeVisible();
  await page.locator('[data-action="ask-submit"]').click();
  await page.locator("#modal-yes").click();
  await expect(page.locator("p.score")).toContainText("40 / 40");
  const meters = page.locator(".bars meter");
  await expect(meters).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    const max = await meters.nth(index).getAttribute("max");
    await expect(meters.nth(index)).toHaveAttribute("value", max);
  }
  await page.locator("#Next").click();
  await expect(page.locator('[data-action="open"]')).toBeVisible();
}
