import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createQuest,
  setQuestStatus,
  toggleQuestStatus,
  groupByStatus,
} from '../src/quest/Quests.js';

test('createQuest defaults to active with empty notes', () => {
  assert.deepEqual(createQuest('q1', 'Find the sword'), {
    id: 'q1',
    title: 'Find the sword',
    notes: '',
    status: 'active',
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
  assert.deepEqual(active.map((q) => q.id), ['q1', 'q3']);
  assert.deepEqual(completed.map((q) => q.id), ['q2']);
});
