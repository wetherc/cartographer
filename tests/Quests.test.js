import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuest,
  setQuestStatus,
  toggleQuestStatus,
  toggleQuestRevealed,
  visibleQuests,
  groupByStatus,
} from '../src/quest/Quests.js';

test('createQuest defaults to active and hidden with empty notes', () => {
  assert.deepEqual(createQuest('q1', 'Find the sword'), {
    id: 'q1',
    title: 'Find the sword',
    notes: '',
    status: 'active',
    revealed: false,
  });
});

test('setQuestStatus returns a new quest without mutating the input', () => {
  const quest = createQuest('q1', 'A');
  const done = setQuestStatus(quest, 'completed');
  assert.equal(done.status, 'completed');
  assert.equal(quest.status, 'active');
});

test('toggleQuestStatus flips between active and completed', () => {
  const quest = createQuest('q1', 'A');
  const done = toggleQuestStatus(quest);
  assert.equal(done.status, 'completed');
  assert.equal(toggleQuestStatus(done).status, 'active');
});

test('groupByStatus splits into active and completed, preserving order', () => {
  const quests = [
    createQuest('q1', 'A'),
    createQuest('q2', 'B', '', 'completed'),
    createQuest('q3', 'C'),
  ];
  const { active, completed } = groupByStatus(quests);
  assert.deepEqual(
    active.map((q) => q.id),
    ['q1', 'q3'],
  );
  assert.deepEqual(
    completed.map((q) => q.id),
    ['q2'],
  );
});

test('toggleQuestRevealed flips visibility without mutating the input', () => {
  const quest = createQuest('q1', 'A');
  const shown = toggleQuestRevealed(quest);
  assert.equal(shown.revealed, true);
  assert.equal(quest.revealed, false);
  assert.equal(toggleQuestRevealed(shown).revealed, false);
});

test('visibleQuests shows a GM every quest and a player only revealed ones', () => {
  const quests = [
    createQuest('q1', 'A', 'lead', 'active', true),
    createQuest('q2', 'B'),
    createQuest('q3', 'C', '', 'completed', true),
  ];
  assert.equal(visibleQuests(quests, true), quests);
  assert.deepEqual(
    visibleQuests(quests, false).map((q) => q.id),
    ['q1', 'q3'],
  );
});
