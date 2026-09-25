export function questionsIn(exam) {
  return exam.sections.flatMap((section) => section.questions);
}

export function isComplete(question, answer) {
  if (answer == null) return false;
  switch (question.type) {
    case "single":
    case "exhibit":
      return Array.isArray(answer) && answer.length === 1;
    case "multi":
    case "hot":
      return Array.isArray(answer) && answer.length === question.select;
    case "build":
      return Array.isArray(answer) && answer.length === question.select;
    case "drag":
      return question.targets.every((target) => answer[target.id]);
    case "active":
      return question.controls.every((control) => answer[control.id]);
    case "yesno":
      return question.statements.every((statement) => answer[statement.id] === "yes" || answer[statement.id] === "no");
    default:
      return false;
  }
}

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const wanted = new Set(right);
  return left.every((item) => wanted.has(item));
}

export function isCorrect(question, answer) {
  if (!isComplete(question, answer)) return false;
  switch (question.type) {
    case "single":
    case "exhibit":
    case "multi":
    case "hot":
      return sameSet(answer, question.correct);
    case "build":
      return question.correct.every((id, index) => answer[index] === id);
    case "drag":
      return question.targets.every((target) => answer[target.id] === question.correct[target.id]);
    case "active":
      return question.controls.every((control) => answer[control.id] === question.correct[control.id]);
    case "yesno":
      return question.statements.every((statement) => answer[statement.id] === question.correct[statement.id]);
    default:
      return false;
  }
}

export function scoreExam(exam, answers) {
  const questions = questionsIn(exam);
  const byDomain = {};
  for (const domain of exam.domains) {
    byDomain[domain.id] = { correct: 0, total: 0, label: domain.label };
  }
  let correct = 0;
  for (const question of questions) {
    const hit = isCorrect(question, answers[question.id]);
    if (hit) correct += 1;
    const bucket = byDomain[question.domain];
    if (bucket) {
      bucket.total += 1;
      if (hit) bucket.correct += 1;
    }
  }
  return { correct, total: questions.length, byDomain };
}
