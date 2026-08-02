#!/usr/bin/env node
/**
 * Build docs/dev-guide.html from the source tree.
 *
 *   node scripts/build-dev-guide.mjs           write the page
 *   node scripts/build-dev-guide.mjs --check   fail if the page is stale
 *
 * Counts, import edges, mount order, registry entries, storage keys, code
 * snippets, and save sizes all come from the repository. The prose and the
 * classifications live in scripts/dev-guide/content.mjs, and every name they
 * mention is checked before the page is written.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  scanDirectories,
  scanImportEdges,
  scanMountOrder,
  scanRegistrations,
  scanStorageKeys,
  scanTests,
  scanPackage,
} from './dev-guide/scan.mjs';
import { snippet, region, assertSymbol, locate, MissingReference } from './dev-guide/extract.mjs';
import { measureSave, measureDensestNode, measureRevealRadius } from './dev-guide/measure.mjs';
import {
  DIRECTORY_META,
  KIND_GROUPS,
  STAGE_NOTES,
  ROUTER_TREE,
  ROUTER_ANSWERS,
  CHECKLIST,
  COMMANDS,
  SNIPPETS,
  PROSE_REFERENCES,
} from './dev-guide/content.mjs';
import { renderGuide } from './dev-guide/render.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'docs', 'dev-guide.html');

function collect() {
  const pkg = scanPackage(ROOT);
  const edges = scanImportEdges(ROOT);

  const dirs = scanDirectories(ROOT).map((dir) => {
    const meta = DIRECTORY_META[dir.id] || { kind: 'unclassified', role: '' };
    return { ...dir, kind: meta.kind, role: meta.role, imports: edges[dir.id] || [] };
  });

  const registrations = scanRegistrations(ROOT);
  const mount = scanMountOrder(ROOT);
  const steps = mount.steps.map((step) => ({
    ...step,
    regs: (registrations[step.call] || []).map((r) => ({ registry: r.registry, name: r.name })),
  }));

  const missingWiring = steps.filter((s) => !registrations[s.call]);
  if (missingWiring.length) {
    throw new MissingReference(
      `src/app: no module exports ${missingWiring.map((s) => s.call).join(', ')}`,
    );
  }

  const measured = measureSave();
  measured.stages = measured.stages.map((stage) => ({ ...stage, note: STAGE_NOTES[stage.id] || '' }));

  const commands = COMMANDS.map((entry) => {
    if (!entry.script) return { command: entry.command, note: entry.note };
    if (!pkg.scripts[entry.script]) {
      throw new MissingReference(`package.json: no script named "${entry.script}"`);
    }
    return { command: `pnpm run ${entry.script}`, note: entry.note };
  });

  const routerAnswers = {};
  for (const [key, answer] of Object.entries(ROUTER_ANSWERS)) {
    routerAnswers[key] = {
      where: answer.where,
      test: answer.test,
      trap: answer.trap,
      refs: answer.refs.map(([file, symbol]) => ({
        file,
        symbol,
        line: locate(ROOT, file, symbol),
      })),
    };
  }

  const checklist = CHECKLIST.map(([title, note, refs]) => ({
    title,
    note,
    refs: refs.map(([file, symbol]) => ({ file, symbol, line: locate(ROOT, file, symbol) })),
  }));

  const snippets = {};
  for (const [key, spec] of Object.entries(SNIPPETS)) {
    snippets[key] = spec.region
      ? region(ROOT, spec.file, spec.region)
      : snippet(ROOT, spec.file, spec.symbol);
  }

  for (const [file, symbol] of PROSE_REFERENCES) assertSymbol(ROOT, file, symbol);

  return {
    pkg,
    dirs,
    kindGroups: KIND_GROUPS,
    steps,
    snippets,
    measured,
    densest: measureDensestNode(),
    revealRadius: measureRevealRadius(),
    storageKeys: scanStorageKeys(ROOT),
    tests: scanTests(ROOT),
    commands,
    checklist,
    routerTree: ROUTER_TREE,
    routerAnswers,
  };
}

function main() {
  const check = process.argv.includes('--check');

  let data;
  try {
    data = collect();
  } catch (error) {
    if (error instanceof MissingReference) {
      console.error('dev guide: the page refers to something the repository no longer has.');
      console.error('  ' + error.message);
      console.error('  Fix the reference in scripts/dev-guide/content.mjs, then rebuild.');
      process.exit(1);
    }
    throw error;
  }

  data.generatedAt = 'source fingerprint ' + fingerprint(data);
  const html = renderGuide(data);

  if (check) {
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {
      current = '';
    }
    if (current !== html) {
      console.error('dev guide: docs/dev-guide.html is out of date. Run pnpm run guide.');
      process.exit(1);
    }
    console.log('dev guide: up to date.');
    return;
  }

  writeFileSync(OUTPUT, html);
  console.log(
    `dev guide: wrote docs/dev-guide.html (${data.steps.length} mount steps, ` +
      `${data.dirs.length} source areas, ${Object.keys(data.snippets).length} snippets).`,
  );
}

/**
 * A short hash of everything the page shows, so any change to the collected
 * data changes the stamp in the footer.
 * @param {any} data
 */
function fingerprint(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);
}

main();
