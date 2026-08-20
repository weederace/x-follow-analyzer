/**
 * test_frontend.mjs — drives web/app.js in a minimal DOM.
 *
 * The old version of this file tested the frontend that used to live inside a Python
 * string. That frontend is gone, so this one loads the real web/index.html, installs
 * the globals a browser would provide, imports the real controller, and clicks things.
 *
 * The fake fetch mirrors the Python endpoints, so a protocol drift between
 * history.js and x_analyzer_server.py shows up here as a failure.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { install } from './minidom.mjs';

// Located from this file so the suite runs from a clone anywhere. WEB is for reading
// files; mod() is for importing them, because on Windows a bare drive path is not a
// valid module specifier.
const WEB = fileURLToPath(new URL('../web', import.meta.url)).replace(/[\\/]+$/, '');
const mod = (name) => new URL(`../web/${name}`, import.meta.url).href;
let ok = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { ok += 1; console.log(`  PASS  ${label}`); }
  else { fail += 1; console.log(`  FAIL  ${label}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// A stand-in for the Python server, with the same validation rules.
// ---------------------------------------------------------------------------
const server = {
  history: [],
  offline: false,
  calls: [],
  clean(ids) {
    const out = [], seen = new Set();
    for (const raw of Array.isArray(ids) ? ids : []) {
      const id = typeof raw === 'number' ? String(Math.trunc(raw)) : raw;
      if (typeof id !== 'string' || !/^\d+$/.test(id.trim()) || id.trim().length > 32) continue;
      if (seen.has(id.trim())) continue;
      seen.add(id.trim()); out.push(id.trim());
    }
    return out;
  },
};

let analysis = null;

globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  server.calls.push(`${method} ${url}`);
  const json = () => (options.body ? JSON.parse(options.body) : undefined);

  if (url === '/api/analyze') {
    if (!analysis) return { ok: false, status: 400, json: async () => ({ detail: 'errUnknown' }) };
    return { ok: true, status: 200, json: async () => analysis };
  }
  if (url === '/api/history') {
    if (server.offline) throw new Error('connection refused');
    if (method === 'GET') { /* fall through */ }
    else if (method === 'POST') {
      const body = json();
      if (!body || !Array.isArray(body.ids)) return { ok: false, status: 400, json: async () => ({}) };
      for (const id of server.clean(body.ids)) if (!server.history.includes(id)) server.history.push(id);
    } else if (method === 'DELETE') {
      const body = json();
      if (body && Array.isArray(body.ids)) {
        const drop = new Set(server.clean(body.ids));
        server.history = server.history.filter((id) => !drop.has(id));
      } else server.history = [];
    }
    return { ok: true, status: 200, json: async () => ({ processed: [...server.history], count: server.history.length }) };
  }
  throw new Error(`unexpected fetch: ${url}`);
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const globals = install(readFileSync(`${WEB}/index.html`, 'utf8'));
// Reduced motion keeps the card transitions instant so the suite stays fast; the
// animated path is exercised separately below.
globals.matchMedia = () => ({ matches: true });
Object.assign(globalThis, globals);
// Node ships DecompressionStream, so without this the controller would take its
// in-page reader path and try to inflate a fake File. Removing it exercises the
// fallback to POST /api/analyze instead; the in-page reader has its own suite
// (test_analyzer.mjs), which runs the real ZIP end to end.
delete globalThis.DecompressionStream;

console.log('\n[1] The page has the structure the controller expects');
const el = (id) => document.getElementById(id);
check('index.html parsed into a tree', document.body.descendants().length > 80);
check('the deck has three ghost cards', document.querySelectorAll('.card--ghost').length === 3);
check('three view tabs exist', document.querySelectorAll('.view').length === 3);

// Importing runs the module, including its top-level await history.open().
await import(mod('app.js'));

check('startup did not throw', el('intro') !== null);
check('history came from the server, not the device', server.calls[0] === 'GET /api/history');
check('the blank docket is what you see first', !el('intro').hidden && el('deck').hidden);
check('storage line names the shared file', el('storage').textContent.includes('پوشهٔ کاربری'));

console.log('\n[2] Every label the markup asks for exists in both languages');
const keys = [...new Set(document.querySelectorAll('[data-t]').map((n) => n.dataset.t))];
const faMissing = [], enMissing = [];
// Read the dictionaries out of the source: they are module-private by design.
const source = readFileSync(`${WEB}/app.js`, 'utf8');
const faBlock = source.slice(source.indexOf('  fa: {'), source.indexOf('  en: {'));
const enBlock = source.slice(source.indexOf('  en: {'), source.indexOf('\n};'));
for (const key of keys) {
  if (!new RegExp(`(^|\\s)${key}:`, 'm').test(faBlock)) faMissing.push(key);
  if (!new RegExp(`(^|\\s)${key}:`, 'm').test(enBlock)) enMissing.push(key);
}
check(`all ${keys.length} data-t keys exist in Persian`, faMissing.length === 0);
if (faMissing.length) console.log(`        missing: ${faMissing.join(', ')}`);
check('all data-t keys exist in English', enMissing.length === 0);
if (enMissing.length) console.log(`        missing: ${enMissing.join(', ')}`);
const faKeys = [...faBlock.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]);
const enKeys = [...enBlock.matchAll(/^\s{4}([a-zA-Z]+):/gm)].map((m) => m[1]);
check('the two dictionaries carry the same keys',
      faKeys.length > 40 && faKeys.every((k) => enKeys.includes(k)) && enKeys.every((k) => faKeys.includes(k)));

console.log('\n[3] Loading an archive fills the desk');
const people = Array.from({ length: 7 }, (_, i) => ({
  account_id: String(1000 + i),
  username: i === 6 ? '' : `user${i}`,
  url: i === 6 ? 'https://x.com/i/user/1006' : `https://x.com/user${i}`,
}));
analysis = {
  account_username: 'ashka',
  stats: { followers: 40, following: 100, remaining: 7, mutuals: 93, win_rate: 93.0, ratio: 0.4 },
  not_following: people,
  ignored_files: ['data/follower-requests-sent.js', 'data/following-requests.js'],
};
el('file').dispatch('change', { target: { files: [{ name: 'archive.zip' }] } });
await sleep(20);

check('the queue view is on the stage', !el('deck').hidden && el('intro').hidden);
check('the counter reads 7', el('odometer-text').textContent.startsWith('7'));
check('the counter has one digit reel', document.querySelectorAll('.digit__reel').length === 1);
check('the reel is parked on 7',
      document.querySelector('.digit__reel').style.transform === 'translateY(-7em)');
check('the front card shows the first account', el('card-handle').textContent === '@user0');
check('the rail shows the totals', el('fig-following').textContent === '100');
check('the win rate is shown as given', el('fig-rate').textContent === '93%');
check('the account handle is on the masthead', el('whoami').textContent === '@ashka');
check('skipped files are disclosed, not hidden', !el('skipped').hidden && el('skipped-count').textContent === '2');
check('the spool starts full', el('spool').style.width === '100%');

console.log('\n[4] Open and record — the bug that started all this');
const before = globals.opened.length;
el('act-open').dispatch('click');
check('one tab opened, synchronously from the click', globals.opened.length === before + 1);
check('it opened the right profile', globals.opened.at(-1) === 'https://x.com/user0');
await sleep(150);
check('the card left and the count dropped', el('odometer-text').textContent.startsWith('6'));
check('the next account moved up', el('card-handle').textContent === '@user1');
check('the decision reached the server', server.history.includes('1000'));
check('recorded total went up in the rail', el('fig-cleared').textContent === '1');
check('the spool drained', el('spool').style.width !== '100%');

console.log('\n[5] Next is not progress');
el('act-skip').dispatch('click');
await sleep(10);
check('skipping does not lower the count', el('odometer-text').textContent.startsWith('6'));
check('the skipped account goes to the back', el('card-handle').textContent === '@user2');
check('nothing was recorded for a skip', !server.history.includes('1001'));

console.log('\n[6] Keyboard, batch, and the configurable count');
el('batch-size').value = '5';
el('batch-size').dispatch('change');
check('the batch label follows the chosen number', el('batch-label').textContent.includes('5'));
check('the choice is remembered for next time', localStorage.getItem('x_batch_size') === '5');

const beforeBatch = globals.opened.length;
document.body.dispatch('keydown', { target: { tagName: 'BODY' }, key: 'b' });
await sleep(20);
check('B opened five tabs at once', globals.opened.length === beforeBatch + 5);
check('all five were recorded', server.history.length === 6);
check('the counter now reads 1', el('odometer-text').textContent.startsWith('1'));
check('typing in a field does not trigger shortcuts',
      (() => {
        const seen = globals.opened.length;
        el('find').dispatch('keydown', { target: { tagName: 'INPUT' }, key: 'o' });
        return globals.opened.length === seen;
      })());

console.log('\n[7] Undo puts it back');
document.body.dispatch('keydown', { target: { tagName: 'BODY' }, key: 'u' });
await sleep(20);
check('the five come back to the queue', el('odometer-text').textContent.startsWith('6'));
check('the server forgot them too', server.history.length === 1);
check('undo is exhausted after the last step', el('act-undo').disabled === false);

console.log('\n[8] The list views');
document.querySelectorAll('.view').find((v) => v.dataset.view === 'all').dispatch('click');
check('the sheet replaced the deck', !el('sheet').hidden && el('deck').hidden);
check('every account is listed', el('rows').children.length === 7);
check('the blank handle is labelled, not left empty',
      el('rows').textContent.includes('بدون یوزرنیم'));
el('find').value = 'user3';
el('find').dispatch('input');
check('search narrows the sheet', el('rows').children.length === 1);
check('the count reflects the search', el('sheet-count').textContent.startsWith('1'));
el('find').value = 'zzz';
el('find').dispatch('input');
check('a search with no hits says so', el('rows').textContent.includes('پیدا نشد'));
el('find').value = '';
el('find').dispatch('input');

document.querySelectorAll('.view').find((v) => v.dataset.view === 'done').dispatch('click');
check('the recorded view shows only what was recorded', el('rows').children.length === 1);

// 1/2/3 match the desktop app. They are handled *before* the "shortcuts only on the
// queue" guard, so the case worth checking is the one that ordering exists for: getting
// back to the queue while a list is open.
document.body.dispatch('keydown', { target: { tagName: 'BODY' }, key: '1' });
check('1 returns to the queue from a list view', !el('deck').hidden && el('sheet').hidden);
document.body.dispatch('keydown', { target: { tagName: 'BODY' }, key: '2' });
check('2 opens the full list', !el('sheet').hidden && el('rows').children.length === 7);
el('find').dispatch('keydown', { target: { tagName: 'INPUT' }, key: '1' });
check('a number typed into the search box does not switch views', !el('sheet').hidden);
document.body.dispatch('keydown', { target: { tagName: 'BODY' }, key: '3' });
check('3 opens the handled list', el('rows').children.length === 1);

console.log('\n[9] Language switch');
el('lang').dispatch('click');
check('the document language flips', document.documentElement.lang === 'en');
check('direction flips with it', document.documentElement.dir === 'ltr');
check('the toggle now offers Persian back', el('lang-label').textContent === 'فا');
check('labels are translated', el('forget').textContent.includes('Erase'));
check('the counter caption is translated', el('odometer-text').textContent.includes('Left in queue'));
check('the sheet was repainted in English', el('rows').textContent.includes('Back to queue'));
el('lang').dispatch('click');
check('and back to Persian', document.documentElement.lang === 'fa');

console.log('\n[10] When things go wrong');
document.querySelectorAll('.view').find((v) => v.dataset.view === 'queue').dispatch('click');
globals.popupsBlocked = true;
const stuck = el('card-handle').textContent;
el('act-open').dispatch('click');
await sleep(20);
check('a blocked pop-up shows an explanation', !el('notice').hidden);
check('the explanation says what to do', el('notice-text').textContent.includes('pop-up'));
check('the account stays in the queue when nothing opened', el('card-handle').textContent === stuck);
globals.popupsBlocked = false;
el('notice-x').dispatch('click');
check('the notice can be dismissed', el('notice').hidden);

server.offline = true;
el('act-open').dispatch('click');
await sleep(150);   // long enough for the stamp to finish, as a real click would be
check('a failed save warns instead of pretending', !el('notice').hidden);
check('it says the decision may not be remembered',
      el('notice-text').textContent.includes('سرور'));
server.offline = false;

analysis = null;
el('file2').dispatch('change', { target: { files: [{ name: 'not-an-archive.txt' }] } });
await sleep(20);
check('an unreadable archive returns you to the blank docket', !el('intro').hidden);
check('and explains the failure', !el('notice').hidden && el('notice-text').textContent.length > 20);

console.log('\n[11] Erasing history');
analysis = { ...analysis, ...{
  account_username: '', stats: { followers: 1, following: 3, remaining: 3, mutuals: 0, win_rate: 0, ratio: 0.33 },
  not_following: people.slice(0, 3), ignored_files: [],
} };
server.history = ['1000'];
el('file').dispatch('change', { target: { files: [{ name: 'archive.zip' }] } });
await sleep(20);
check('accounts already recorded are not queued again', el('odometer-text').textContent.startsWith('2'));
check('a missing account handle hides the masthead name', el('whoami').hidden);
el('forget').dispatch('click');
await sleep(20);
check('erasing puts everyone back', el('odometer-text').textContent.startsWith('3'));
check('the server history is empty', server.history.length === 0);

console.log('\n[12] A stamp still in flight must not touch the next archive');
// The stamp lands on a timer. Loading a new archive before it does used to let the old
// timer fire against the new queue, retiring its first account on top of the one that
// was genuinely recorded — so two accounts vanished for one click.
analysis = { account_username: 'ashka',
  stats: { followers: 5, following: 9, remaining: 4, mutuals: 5, win_rate: 55.6, ratio: 0.56 },
  not_following: people.slice(0, 4), ignored_files: [] };
server.history = [];
el('file').dispatch('change', { target: { files: [{ name: 'a.zip' }] } });
await sleep(20);
check('the fresh queue holds four', el('odometer-text').textContent.startsWith('4'));
el('act-open').dispatch('click');                       // starts a stamp, does not finish it
el('file').dispatch('change', { target: { files: [{ name: 'b.zip' }] } });
await sleep(200);                                       // past when the old stamp would have fired
check('exactly the one recorded account is gone', el('odometer-text').textContent.startsWith('3'));
check('the next account was not skipped along with it', el('card-handle').textContent === '@user1');
check('and the card is not stuck mid-stamp', !el('card').classList.contains('is-stamped'));
check('only that one account is in the history', server.history.length === 1);

console.log('\n[13] The counter reshapes when the digit count changes');
// A queue crossing 10 → 9 has to rebuild its reels, and that is where an odometer
// usually breaks: either it keeps a stale reel or it spins every digit from zero.
analysis = { ...analysis, not_following: Array.from({ length: 12 }, (_, i) => ({
  account_id: String(2000 + i), username: `p${i}`, url: `https://x.com/p${i}`,
})), stats: { followers: 5, following: 20, remaining: 12, mutuals: 8, win_rate: 40, ratio: 0.25 } };
el('file').dispatch('change', { target: { files: [{ name: 'archive.zip' }] } });
await sleep(20);
check('two reels for a two-digit count', document.querySelectorAll('.digit__reel').length === 2);
const reels = () => document.querySelectorAll('.digit__reel').map((r) => r.style.transform);
check('12 parks the reels on 1 and 2',
      reels()[0] === 'translateY(-1em)' && reels()[1] === 'translateY(-2em)');
el('act-skip').dispatch('click');
check('a skip leaves the reels alone', reels()[1] === 'translateY(-2em)');
for (let i = 0; i < 3; i += 1) { el('act-open').dispatch('click'); await sleep(120); }
check('crossing to 9 drops back to one reel', document.querySelectorAll('.digit__reel').length === 1);
check('the single reel is parked on 9', reels()[0] === 'translateY(-9em)');
check('no orphan separator left behind', document.querySelectorAll('.digit--sep').length === 0);

console.log('\n[14] The empty queue');
let guard = 0;
while (!el('card').hidden && guard < 40) { el('act-open').dispatch('click'); await sleep(110); guard += 1; }
check('the queue can actually be emptied', el('card').hidden);
check('the empty state explains what to do next', !el('card-empty').hidden);
check('the counter reads zero', el('odometer-text').textContent.startsWith('0'));
check('the spool is empty', el('spool').style.width === '0%');
check('no ghost cards linger behind an empty deck',
      document.querySelectorAll('.card--ghost').every((g) => g.hidden));
check('batch is disabled with nothing to batch', el('act-batch').disabled);
el('act-skip').dispatch('click');
await sleep(20);
check('pressing next on an empty queue is harmless', el('odometer-text').textContent.startsWith('0'));
el('empty-see').dispatch('click');
check('the empty card offers a way to review what you did', !el('sheet').hidden);

console.log('\n[15] The Android build drops what does not work on a phone');
// Everything above ran with Capacitor undefined, i.e. the browser build. Boot a second
// copy on a fresh DOM with Capacitor present to prove the native gate actually fires —
// otherwise the CSS rules keyed on [data-native] would be dead code nobody notices.
const nativeDom = install(readFileSync(`${WEB}/index.html`, 'utf8'));
nativeDom.matchMedia = () => ({ matches: true });
Object.assign(globalThis, nativeDom);
globalThis.Capacitor = { getPlatform: () => 'android' };
analysis = null;                                    // no archive loaded in this copy
await import(`${mod('app.js')}?native=1`);             // query string defeats the module cache
const nel = (id) => nativeDom.document.getElementById(id);
check('the root is flagged so the CSS can respond',
      nativeDom.document.documentElement.dataset.native === 'true');
check('the keyboard row is hidden with no keyboard to press', nel('keys').hidden);
check('the batch tray is gated in CSS, not left visible',
      readFileSync(`${WEB}/app.css`, 'utf8').includes(':root[data-native="true"] .batch'));
check('one-at-a-time still works: the open button is there', nel('act-open') !== null);
delete globalThis.Capacitor;

console.log(`\n${'='.repeat(52)}\n  ${ok} passed, ${fail} failed\n${'='.repeat(52)}`);
process.exit(fail ? 1 : 0);
