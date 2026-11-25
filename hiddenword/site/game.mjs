export const MAX_TRIES = 5;

export function createGame(puzzle, words) {
  return { puzzle, words, tries: [], hints: puzzle.hints.slice(0, 1), done: false, solved: false };
}

export function guess(game, input) {
  if (game.done) return { kind: 'over' };
  const word = String(input).replace(/\s+/g, '');
  if (!word) return { kind: 'empty' };
  const { answer, hints, scores } = game.puzzle;
  if (game.hints.some((h) => h.word === word)) return { kind: 'clue' };
  if (game.tries.some((t) => t.word === word)) return { kind: 'duplicate' };
  if (word === answer) {
    game.tries.push({ word, score: 100 });
    game.done = true;
    game.solved = true;
    return { kind: 'correct', score: 100 };
  }
  const known = word in scores;
  if (!known && !game.words.has(word)) return { kind: 'unknown' };
  const score = known ? scores[word] : null;
  game.tries.push({ word, score });
  const next = hints.find((h) => !game.hints.includes(h) && !game.tries.some((t) => t.word === h.word));
  if (next) game.hints.push(next);
  if (game.tries.length >= MAX_TRIES) game.done = true;
  return known ? { kind: 'scored', score } : { kind: 'far' };
}

export function shareText(game) {
  const result = game.solved ? `${game.tries.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  const line = game.tries.map((t) => (game.solved && t.word === game.puzzle.answer ? '정답' : t.score ?? '30↓')).join(' → ');
  return `히든 워드 ${game.puzzle.no}번 ${result}\n${line}`;
}
