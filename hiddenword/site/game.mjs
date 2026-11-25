export const MAX_TRIES = 5;

export function createGame(puzzle) {
  return { puzzle, tries: [], done: false, solved: false };
}

export function guess(game, input) {
  if (game.done) return { kind: 'over' };
  const word = String(input).replace(/\s+/g, '');
  if (!word) return { kind: 'empty' };
  const { answer, clue, scores } = game.puzzle;
  if (word === clue.word) return { kind: 'clue' };
  if (game.tries.some((t) => t.word === word)) return { kind: 'duplicate' };
  if (word === answer) {
    game.tries.push({ word, score: 100 });
    game.done = true;
    game.solved = true;
    return { kind: 'correct', score: 100 };
  }
  if (!(word in scores)) return { kind: 'unknown' };
  const score = scores[word];
  game.tries.push({ word, score });
  if (game.tries.length >= MAX_TRIES) game.done = true;
  return { kind: 'scored', score };
}

export function shareText(game) {
  const result = game.solved ? `${game.tries.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  const line = game.tries.map((t) => (game.solved && t.word === game.puzzle.answer ? '정답' : t.score)).join(' → ');
  return `히든 워드 ${game.puzzle.no}번 ${result}\n${line}`;
}
