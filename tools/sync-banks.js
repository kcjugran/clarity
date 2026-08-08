#!/usr/bin/env node
/**
 * sync-banks.js — keep Clarity Lite and the website genie in step with the genie app's banks.
 *
 *   node tools/sync-banks.js            # check only: report drift, exit 1 if any (default)
 *   node tools/sync-banks.js --write    # apply the genie's text to every tracked entry
 *   node tools/sync-banks.js --genie <path>   # if clarity-genie isn't the sibling directory
 *
 * WHY THIS EXISTS
 * The three surfaces (genie app, Lite, website) hold three copies of the same question banks in
 * three different data shapes. They were kept in step by hand, which drifts silently: a bank gains
 * a question in the genie app and the other two quietly fall behind, with nothing to notice it.
 *
 * The genie app is the single source of truth. Its bank.ts is COMPILED (esbuild) and the real
 * exported array read out of it — never regex-scraped. A regex scrape was tried first and silently
 * dropped questions (it found 8 of 11 'want', 3 of 7 'journal') because it can't handle every
 * string form in the file. If you ever change how banks are read, compile; don't pattern-match.
 *
 * WHAT IT SYNCS: question text, and only for entries listed in the maps below.
 * WHAT IT DOES NOT: labels, emoji, icons, names, blurbs, tags, intros. Those are editorial and
 * differ per surface on purpose, so they stay manual. Adding a NEW tile is therefore still a hand
 * edit — but this script will TELL you a bank is missing from a surface, which is the part that
 * used to get forgotten.
 *
 * esbuild is resolved from clarity-genie's node_modules (this repo has no package.json).
 */

const fs = require('fs');
const path = require('path');

const CLARITY = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const genieFlag = argv.indexOf('--genie');
const GENIE = genieFlag > -1 ? path.resolve(argv[genieFlag + 1]) : path.resolve(CLARITY, '..', 'clarity-genie');

const LITE_FILE = path.join(CLARITY, 'lite-build/www/index.html');
const WEB_FILE = path.join(CLARITY, 'index.html');

/* ------------------------------------------------------------------ maps --
 * Lite mirrors the genie's tile set closely, so every mood tracks a bank.
 */
const LITE_MAP = {
  bored: 'boredom',
  confused: 'boredom',
  notSure: 'vision',
  procrastinating: 'want',
  anxious: 'anxious',
  overwhelmed: 'want',
  volatile: 'emotions',
  drained: 'boredom',
  demotivated: 'resistance',
  wantSomething: 'want',
  overcomeHabit: 'want',
  overcomeFear: 'overcomeFear',
  loneliness: 'loneliness',
  selfEsteem: 'selfEsteem',
  idealPartner: 'idealPartner',
  triggered: 'triggered',
  avoiding: 'avoiding',
  mission: 'mission',
  crisis: 'crisis',
  selfHate: 'selfHate',
  greatDay: 'greatDay',
  badDay: 'badDay',
  painfulInteractions: 'painfulInteractions',
  somethingElse: 'want',
  journalMorning: 'morning',
  journal: 'journal',
};

/* The website has its own curated taxonomy. These keys carry genie text verbatim and must stay
 * in step. */
const WEB_MAP = {
  confused: 'boredom',
  volatile: 'emotions',
  demotivated: 'resistance',
  wantSomething: 'want',
  overcomeFear: 'overcomeFear',
  selfEsteem: 'selfEsteem',
  idealPartner: 'idealPartner',
  triggered: 'triggered',
  avoiding: 'avoiding',
  mission: 'mission',
  crisis: 'crisis',
  selfHate: 'selfHate',
  greatDay: 'greatDay',
  badDay: 'badDay',
  painfulInteractions: 'painfulInteractions',
  somethingElse: 'want',
  journalMorning: 'morning',
  journal: 'journal',
};

/* Website entries that are deliberately NOT the genie text — reworded for a public audience, or
 * website-only concepts with no genie bank at all. Listed explicitly so "not synced" is a recorded
 * decision rather than an oversight. Never touched; remove a key from here (and add it to WEB_MAP)
 * only if you actually want the genie wording on the website. */
const WEB_BESPOKE = {
  anxious: 'reworded for the public site; genie anxious is a different, longer bank',
  stuck: 'website-only concept, no genie bank',
  bored: 'reworded; genie boredom is more direct',
  unsure: 'website-only framing of the vision bank',
  work: 'website-only concept, no genie bank',
  lonely: 'reworded; genie loneliness is longer',
  overwhelmed: 'reworded for the public site',
  drained: 'reworded; energy-focused rather than the boredom bank',
  overcomeHabit: 'reworded for the public site',
};

/* Genie banks that intentionally never reach a public surface (reachable in the app only via a
 * feeling's weighted lane rotation). Keeps the "unsurfaced bank" report honest. */
const GENIE_ONLY_BANKS = ['truePriorities', 'workValue', 'love'];

/* ------------------------------------------------------------------ read -- */

function loadGenieBanks() {
  let esbuild;
  const esbuildPath = path.join(GENIE, 'node_modules', 'esbuild');
  try {
    esbuild = require(esbuildPath);
  } catch (e) {
    fail(
      `Could not load esbuild from ${esbuildPath}\n` +
        `  Expected clarity-genie at: ${GENIE}\n` +
        `  Pass --genie <path> if it lives somewhere else, or run npm install there.`
    );
  }
  const entry = path.join(GENIE, 'src/engine-v2/bank.ts');
  if (!fs.existsSync(entry)) fail(`No bank.ts at ${entry}`);

  const built = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);

  const all = mod.exports.V2_QUESTION_BANK;
  if (!Array.isArray(all) || !all.length) fail('V2_QUESTION_BANK came back empty — bank.ts shape changed?');

  const banks = {};
  for (const q of all) (banks[q.bank] = banks[q.bank] || []).push(q.text);
  return banks;
}

function readLite() {
  const src = fs.readFileSync(LITE_FILE, 'utf8');
  const start = src.indexOf('var DATA = ');
  if (start < 0) fail('var DATA not found in the Lite file');
  const lineEnd = src.indexOf('\n', start);
  const json = src.slice(start, lineEnd).replace(/^var DATA = /, '').replace(/;\s*$/, '');
  return { src, start, lineEnd, DATA: JSON.parse(json) };
}

function readWeb() {
  const src = fs.readFileSync(WEB_FILE, 'utf8');
  const start = src.indexOf('var GENIE_ORDER');
  const end = src.indexOf('\n};', src.indexOf('var GENIE = {'));
  if (start < 0 || end < 0) fail('GENIE structures not found in the website file');
  const box = {};
  new Function('g', src.slice(start, end + 3) + '\ng.O=GENIE_ORDER;g.I=GENIE_ICONS;g.G=GENIE;')(box);
  return { src, O: box.O, I: box.I, G: box.G };
}

/* ----------------------------------------------------------------- write --
 * The website's GENIE lives inside a 230KB HTML file, so each entry's questions array is replaced
 * in place rather than the object being regenerated. The array is scanned string-aware so a `]`
 * inside question text can't end it early.
 */
function replaceWebQuestions(src, key, questions) {
  const keyAt = src.indexOf(`\n  ${key}: {`);
  if (keyAt < 0) throw new Error(`website entry not found: ${key}`);
  const qAt = src.indexOf('questions: [', keyAt);
  if (qAt < 0) throw new Error(`questions array not found for: ${key}`);

  let i = qAt + 'questions: ['.length;
  let inStr = false;
  let quote = '';
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === quote) inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === ']') break;
  }
  if (i >= src.length) throw new Error(`unterminated questions array for: ${key}`);

  const body = '\n' + questions.map((q) => '      ' + JSON.stringify(q)).join(',\n') + '\n    ';
  return src.slice(0, qAt + 'questions: ['.length) + body + src.slice(i);
}

/* ------------------------------------------------------------------ main -- */

function fail(msg) {
  console.error('ERROR: ' + msg);
  process.exit(2);
}

const banks = loadGenieBanks();
const drift = [];
const notes = [];
const missing = [];

// --- Lite
const lite = readLite();
const liteById = Object.fromEntries(lite.DATA.moods.map((m) => [m.id, m]));
for (const [id, bank] of Object.entries(LITE_MAP)) {
  if (!banks[bank]) fail(`LITE_MAP points at unknown genie bank: ${bank}`);
  const mood = liteById[id];
  if (!mood) {
    missing.push(`Lite is missing mood "${id}" (bank ${bank}) — add it by hand with an emoji`);
    continue;
  }
  if (JSON.stringify(mood.questions) !== JSON.stringify(banks[bank])) {
    drift.push({ surface: 'lite', id, bank, from: mood.questions.length, to: banks[bank].length });
    mood.questions = banks[bank].slice();
  }
}
for (const m of lite.DATA.moods) if (!LITE_MAP[m.id]) notes.push(`Lite mood "${m.id}" is not in LITE_MAP — untracked`);

// --- Website
const web = readWeb();
let webSrc = web.src;
for (const [key, bank] of Object.entries(WEB_MAP)) {
  if (!banks[bank]) fail(`WEB_MAP points at unknown genie bank: ${bank}`);
  if (!web.G[key]) {
    missing.push(`Website is missing entry "${key}" (bank ${bank}) — add it by hand with icon + copy`);
    continue;
  }
  if (JSON.stringify(web.G[key].questions) !== JSON.stringify(banks[bank])) {
    drift.push({ surface: 'website', id: key, bank, from: web.G[key].questions.length, to: banks[bank].length });
    if (WRITE) webSrc = replaceWebQuestions(webSrc, key, banks[bank]);
  }
}
for (const k of web.O) {
  if (!WEB_MAP[k] && !WEB_BESPOKE[k]) notes.push(`Website entry "${k}" is in neither WEB_MAP nor WEB_BESPOKE — decide which`);
}

// --- banks that reach no public surface
const surfaced = new Set([...Object.values(LITE_MAP), ...Object.values(WEB_MAP)]);
for (const b of Object.keys(banks)) {
  if (!surfaced.has(b) && !GENIE_ONLY_BANKS.includes(b)) {
    missing.push(`Genie bank "${b}" (${banks[b].length} Qs) reaches NO public surface — new tile not propagated?`);
  }
}

// --- report / apply
console.log(`genie banks: ${Object.keys(banks).length}   lite moods: ${lite.DATA.moods.length}   website keys: ${web.O.length}`);

if (notes.length) {
  console.log('\nNOTES:');
  notes.forEach((n) => console.log('  - ' + n));
}
if (missing.length) {
  console.log('\nNEEDS A HAND EDIT:');
  missing.forEach((m) => console.log('  ! ' + m));
}

if (!drift.length) {
  console.log('\nIn sync: every tracked entry matches the genie banks verbatim.');
} else {
  console.log(`\nDRIFT (${drift.length}):`);
  drift.forEach((d) => console.log(`  ~ ${d.surface.padEnd(7)} ${d.id.padEnd(22)} ${d.bank.padEnd(20)} ${d.from} -> ${d.to} Qs`));
}

if (!WRITE) {
  // --write only ever fixes DRIFT. Anything under "needs a hand edit" is metadata this script
  // deliberately won't invent, so don't send the reader to --write for it.
  if (drift.length) console.log('\nCheck only. Re-run with --write to apply the text changes above.');
  if (missing.length && !drift.length) console.log('\nNothing --write can fix here — the items above need a hand edit.');
  process.exit(drift.length || missing.length ? 1 : 0);
}

if (drift.length) {
  fs.writeFileSync(LITE_FILE, lite.src.slice(0, lite.start) + 'var DATA = ' + JSON.stringify(lite.DATA) + ';' + lite.src.slice(lite.lineEnd));
  fs.writeFileSync(WEB_FILE, webSrc);
  console.log('\nWritten. Re-reading both files to verify...');

  const l2 = readLite();
  const w2 = readWeb();
  const bad = [];
  const l2By = Object.fromEntries(l2.DATA.moods.map((m) => [m.id, m]));
  for (const [id, bank] of Object.entries(LITE_MAP)) {
    if (l2By[id] && JSON.stringify(l2By[id].questions) !== JSON.stringify(banks[bank])) bad.push(`lite ${id}`);
  }
  for (const [key, bank] of Object.entries(WEB_MAP)) {
    if (w2.G[key] && JSON.stringify(w2.G[key].questions) !== JSON.stringify(banks[bank])) bad.push(`website ${key}`);
  }
  if (w2.O.length !== web.O.length) bad.push('website key count changed');
  if (l2.DATA.moods.length !== lite.DATA.moods.length) bad.push('lite mood count changed');
  for (const k of w2.O) if (!w2.I[k] || !w2.G[k]) bad.push(`website ${k} lost its icon or entry`);

  if (bad.length) fail('verification FAILED after write: ' + bad.join(', '));
  console.log('Verified: both files re-parse and every tracked entry matches the genie banks.');
} else {
  console.log('\nNothing to write.');
}
