import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isComplete, isCorrect, questionsIn, scoreExam } from "../js/score.js";

const en = JSON.parse(readFileSync(new URL("../data/az-900/en.json", import.meta.url)));
const fr = JSON.parse(readFileSync(new URL("../data/az-900/fr.json", import.meta.url)));
const catalog = JSON.parse(readFileSync(new URL("../data/catalog.json", import.meta.url)));

const enQuestions = questionsIn(en);
const frQuestions = questionsIn(fr);
assert.equal(enQuestions.length, 40);
assert.deepEqual(enQuestions.map((q) => q.id), frQuestions.map((q) => q.id));

const counts = { cloud: 0, architecture: 0, management: 0 };
const types = {};
for (const question of enQuestions) {
  counts[question.domain] += 1;
  types[question.type] = (types[question.type] || 0) + 1;
  assert.ok(question.stem.length > 20, question.id);
  assert.ok(question.rationale.length > 20, question.id);
  assert.ok(question.learnUrl.startsWith("https://learn.microsoft.com/en-us/training/"), question.id);
  const twin = frQuestions.find((item) => item.id === question.id);
  assert.notEqual(twin.stem, question.stem, question.id);
  assert.equal(question.type, twin.type);
  assert.deepEqual(question.correct, twin.correct);
}
assert.deepEqual(counts, { cloud: 11, architecture: 15, management: 14 });
assert.deepEqual(types, {
  single: 19, multi: 8, drag: 3, build: 3, active: 2, hot: 2, exhibit: 2, yesno: 1,
});
assert.equal(en.sections[1].questions.length, 3);
assert.ok(en.sections[1].case.topics.length >= 4);

function perfect(question) {
  if (["single", "exhibit", "multi", "hot", "build"].includes(question.type)) return question.correct;
  return question.correct;
}
const perfectAnswers = Object.fromEntries(enQuestions.map((question) => [question.id, perfect(question)]));
for (const question of enQuestions) {
  assert.equal(isComplete(question, perfectAnswers[question.id]), true, question.id);
  assert.equal(isCorrect(question, perfectAnswers[question.id]), true, question.id);
}
assert.equal(scoreExam(en, perfectAnswers).correct, 40);
assert.equal(scoreExam(en, {}).correct, 0);

const multi = enQuestions.find((question) => question.type === "multi");
assert.equal(isCorrect(multi, [multi.correct[0]]), false);
const build = enQuestions.find((question) => question.type === "build");
assert.equal(isCorrect(build, [...build.correct].reverse()), false);
const drag = enQuestions.find((question) => question.type === "drag");
const partial = { ...drag.correct };
delete partial[drag.targets[0].id];
assert.equal(isComplete(drag, partial), false);

const az = catalog.cards.find((card) => card.code === "AZ-900");
assert.equal(az.available, true);
assert.equal(catalog.cards.filter((card) => card.available).length, 1);
for (const card of catalog.cards) {
  assert.ok(catalog.columns.includes(card.column), card.id);
  assert.ok(catalog.bands.some((band) => band.id === card.band), card.id);
}
const bands = new Set(catalog.cards.map((card) => card.band));
assert.equal(bands.size, 4);

console.log("ok", enQuestions.length, "questions,", catalog.cards.length, "poster cards");
