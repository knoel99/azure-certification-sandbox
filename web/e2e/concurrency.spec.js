import { expect, test } from "@playwright/test";
import {
  advance,
  answerQuestion,
  clickFilter,
  expectQuestion,
  loadExam,
  openFresh,
  openMenu,
  setLang,
} from "./helpers.js";

// L'état d'une tentative vit dans le sessionStorage de son onglet, la langue et
// le thème dans le localStorage du profil. Ces tests verrouillent l'isolement
// des utilisateurs simultanés, sur le même questionnaire ou sur des versions
// différentes (fr/en) du questionnaire.

async function newTab(browser, testInfo) {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL ?? "http://127.0.0.1:8765",
    viewport: use.viewport,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  const page = await context.newPage();
  return { context, page };
}

async function beginExam(page) {
  await page.locator('[data-action="open"]').click();
  await page.locator('[data-action="to-ready"]').click();
  await page.locator('[data-action="begin"]').click();
}

async function finishFromExam(page) {
  await clickFilter(page, "all");
  if (await page.locator("#modal-yes").isVisible()) await page.locator("#modal-yes").click();
  await expect(page.locator('[data-action="ask-submit"]')).toBeVisible();
  await page.locator('[data-action="ask-submit"]').click();
  await page.locator("#modal-yes").click();
}

test("deux onglets du même navigateur : tentatives isolées", async ({ browser }, testInfo) => {
  const fr = loadExam("fr");
  const en = loadExam("en");
  const { context, page: tabA } = await newTab(browser, testInfo);
  const tabB = await context.newPage();

  // L'onglet A démarre l'examen en français et répond juste à la première question.
  await openFresh(tabA);
  await beginExam(tabA);
  const first = fr.sections[0].questions[0];
  await answerQuestion(tabA, first);

  // L'onglet B, sur le même profil, passe en anglais puis démarre son examen et
  // saute la première question.
  await openFresh(tabB);
  await setLang(tabB, "en");
  await beginExam(tabB);
  await tabB.locator("#Next").click();
  await tabB.locator("#modal-yes").click();
  await expectQuestion(tabB, en.sections[0].questions[1]);

  // Le changement de langue partagé (localStorage) ne re-render pas l'onglet A,
  // dont la réponse survit intacte (sessionStorage propre à l'onglet).
  await expect(tabA.locator("html")).toHaveAttribute("lang", "fr");
  await expect(tabB.locator("html")).toHaveAttribute("lang", "en");
  await expectQuestion(tabA, first);
  const runA = JSON.parse(await tabA.evaluate(() => sessionStorage.getItem("az900-run")));
  const runB = JSON.parse(await tabB.evaluate(() => sessionStorage.getItem("az900-run")));
  expect(runA.answers[first.id]).toEqual(first.correct);
  expect(runB.answers[first.id]).toBeUndefined();
  expect(runB.questionIndex).toBe(1);

  // B termine son examen sans avoir répondu : A ne bouge pas.
  await finishFromExam(tabB);
  await expect(tabB.locator("p.score")).toContainText("0 / 40");
  await expectQuestion(tabA, first);
  const runA2 = JSON.parse(await tabA.evaluate(() => sessionStorage.getItem("az900-run")));
  const runB2 = JSON.parse(await tabB.evaluate(() => sessionStorage.getItem("az900-run")));
  expect(runA2.submitted).toBe(false);
  expect(runB2.submitted).toBe(true);

  // A termine à son tour avec sa propre copie : sa réponse compte, pas celle de B.
  await finishFromExam(tabA);
  await expect(tabA.locator("p.score")).toContainText("1 / 40");

  await context.close();
});

test("deux visiteurs distincts : AZ-900 fr et en en parallèle", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "le mobile rejoue la variante deux onglets");
  const fr = loadExam("fr");
  const en = loadExam("en");
  const visitorFr = await newTab(browser, testInfo);
  const visitorEn = await newTab(browser, testInfo);

  await openFresh(visitorFr.page);
  await openFresh(visitorEn.page);
  await setLang(visitorEn.page, "en");
  await beginExam(visitorFr.page);
  await beginExam(visitorEn.page);

  // Les deux visiteurs avancent en même temps, question par question.
  for (let s = 0; s < fr.sections.length; s += 1) {
    for (let i = 0; i < fr.sections[s].questions.length; i += 1) {
      await answerQuestion(visitorFr.page, fr.sections[s].questions[i]);
      await answerQuestion(visitorEn.page, en.sections[s].questions[i]);
      await advance(visitorFr.page, fr.sections[s], i);
      await advance(visitorEn.page, en.sections[s], i);
    }
  }

  // Chacun rend sa copie et reçoit son propre score.
  await finishFromExam(visitorFr.page);
  await expect(visitorFr.page.locator("p.score")).toContainText("40 / 40");
  await finishFromExam(visitorEn.page);
  await expect(visitorEn.page.locator("p.score")).toContainText("40 / 40");
  await expect(visitorFr.page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(visitorEn.page.locator("html")).toHaveAttribute("lang", "en");

  // Le thème choisi par un visiteur ne fuit pas chez l'autre.
  await openMenu(visitorEn.page, "colorSchemeLinks");
  await visitorEn.page.locator('[data-action="theme"][data-theme="dark-mode"]').click();
  await expect(visitorEn.page.locator("html")).toHaveClass(/dark-mode/);
  await expect(visitorFr.page.locator("html")).not.toHaveClass(/dark-mode/);

  await visitorFr.context.close();
  await visitorEn.context.close();
});
