import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isComplete, isCorrect, questionsIn, scoreExam } from "../js/score.js";

const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url)));

// Chaque examen ouvert au jeu doit décrire ici ses attendus : nombre de
// questions par domaine, histogramme des types, questions de l'étude de cas.
const expectations = {
  "az-900": {
    counts: { cloud: 11, architecture: 15, management: 14 },
    types: { single: 19, multi: 8, drag: 3, build: 3, active: 2, hot: 2, exhibit: 2, yesno: 1 },
    caseQuestions: 3,
  },
  "sc-900": {
    counts: { concepts: 10, entra: 10, security: 12, compliance: 8 },
    types: { single: 20, multi: 6, drag: 4, build: 3, active: 2, hot: 2, exhibit: 2, yesno: 1 },
    caseQuestions: 3,
  },
};

const available = catalog.cards.filter((card) => card.available);
assert.equal(available.length, Object.keys(expectations).length, "examens ouverts inattendus");
for (const card of available) assert.ok(expectations[card.id], `pas d'attendus pour ${card.id}`);

let totalQuestions = 0;
for (const card of available) {
  const expect = expectations[card.id];
  const en = JSON.parse(readFileSync(new URL(`../data/${card.id}/en.json`, import.meta.url)));
  const fr = JSON.parse(readFileSync(new URL(`../data/${card.id}/fr.json`, import.meta.url)));

  const enQuestions = questionsIn(en);
  const frQuestions = questionsIn(fr);
  assert.equal(enQuestions.length, 40, card.id);
  assert.deepEqual(enQuestions.map((q) => q.id), frQuestions.map((q) => q.id), card.id);

  const counts = {};
  const types = {};
  for (const question of enQuestions) {
    counts[question.domain] = (counts[question.domain] || 0) + 1;
    types[question.type] = (types[question.type] || 0) + 1;
    assert.ok(question.stem.length > 20, question.id);
    assert.ok(question.rationale.length > 20, question.id);
    assert.ok(question.learnUrl.startsWith("https://learn.microsoft.com/en-us/training/"), question.id);
    const twin = frQuestions.find((item) => item.id === question.id);
    assert.notEqual(twin.stem, question.stem, question.id);
    assert.equal(question.type, twin.type, question.id);
    assert.deepEqual(question.correct, twin.correct, question.id);
  }
  assert.deepEqual(counts, expect.counts, card.id);
  assert.deepEqual(types, expect.types, card.id);
  assert.equal(en.sections[1].questions.length, expect.caseQuestions, card.id);
  assert.ok(en.sections[1].case.topics.length >= 4, card.id);

  const perfectAnswers = Object.fromEntries(enQuestions.map((question) => [question.id, question.correct]));
  for (const question of enQuestions) {
    assert.equal(isComplete(question, perfectAnswers[question.id]), true, question.id);
    assert.equal(isCorrect(question, perfectAnswers[question.id]), true, question.id);
  }
  assert.equal(scoreExam(en, perfectAnswers).correct, 40, card.id);
  assert.equal(scoreExam(en, {}).correct, 0, card.id);

  const multi = enQuestions.find((question) => question.type === "multi");
  assert.equal(isCorrect(multi, [multi.correct[0]]), false, card.id);
  const build = enQuestions.find((question) => question.type === "build");
  assert.equal(isCorrect(build, [...build.correct].reverse()), false, card.id);
  const drag = enQuestions.find((question) => question.type === "drag");
  const partial = { ...drag.correct };
  delete partial[drag.targets[0].id];
  assert.equal(isComplete(drag, partial), false, card.id);
  totalQuestions += enQuestions.length;
}

for (const card of catalog.cards) {
  assert.ok(catalog.columns.includes(card.column), card.id);
  assert.ok(catalog.bands.some((band) => band.id === card.band), card.id);
}
const bands = new Set(catalog.cards.map((card) => card.band));
assert.equal(bands.size, 4);

console.log("ok", available.length, "examens,", totalQuestions, "questions,", catalog.cards.length, "cartes du poster");
