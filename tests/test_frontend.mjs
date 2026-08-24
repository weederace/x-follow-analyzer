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
// Where the read bar stood when each analyze request arrived. The only way to see the bar
// mid-read from outside: once the read is over, the width says nothing about the start.
const barAtRequest = [];

globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  server.calls.push(`${method} ${url}`);
  const json = () => (options.body ? JSON.parse(options.body) : undefined);

  if (url === '/api/analyze') {
    barAtRequest.push(document.getElementById('busy-spool')?.style.width);
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
const html = readFileSync(`${WEB}/index.html`, 'utf8');
const cssSource = readFileSync(`${WEB}/app.css`, 'utf8');
const globals = install(html);
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

// [data-t] covers the labels the markup asks for, but app.js also fetches strings by hand
// with t('key') and say('key'), and those keys are invisible to the sweep above. The
// erase-history dialog opened with the literal string "undefined" as its title and its
// confirm button for as long as it had existed, because the code said t('forget') while the
// web dictionary had been renamed to 'forgetAll' — and nothing read that dialog's text, so
// nothing caught it. Pull every key the code asks for by name and hold it to the same
// both-languages bar. The argument is grabbed up to the first ')', which is enough to reach
// the literals inside say(NATIVE ? 'popupBlockedNative' : 'popupBlocked') without tripping on
// say(failureKey(error)) — that inner call carries no quoted key of its own.
const codeKeys = new Set();
for (const call of source.matchAll(/\b(?:t|say)\(([^)]*)\)/g))
  for (const lit of call[1].matchAll(/'([a-zA-Z]+)'/g)) codeKeys.add(lit[1]);
// One computed family: t(`theme${Mode}`) resolves to themeSystem / themeLight / themeDark.
for (const mode of ['System', 'Light', 'Dark']) codeKeys.add(`theme${mode}`);
const codeList = [...codeKeys];
const faCodeMissing = codeList.filter((k) => !new RegExp(`(^|\\s)${k}:`, 'm').test(faBlock));
const enCodeMissing = codeList.filter((k) => !new RegExp(`(^|\\s)${k}:`, 'm').test(enBlock));
check(`all ${codeList.length} keys fetched by t()/say() in the code exist in Persian`,
      faCodeMissing.length === 0);
if (faCodeMissing.length) console.log(`        missing: ${faCodeMissing.join(', ')}`);
check('all keys fetched by t()/say() in the code exist in English', enCodeMissing.length === 0);
if (enCodeMissing.length) console.log(`        missing: ${enCodeMissing.join(', ')}`);

// A duplicate key in an object literal is not an error: the last one silently wins. That
// happened here — a long introNote naming Settings -> Your account -> Download an archive
// was shadowed by a shorter one, so nobody was told where to get the ZIP.
const twice = (list) => [...new Set(list.filter((k, i) => list.indexOf(k) !== i))];
check('no Persian key is declared twice, where the second would silently win',
      twice(faKeys).length === 0);
if (twice(faKeys).length) console.log(`        duplicated: ${twice(faKeys).join(', ')}`);
check('no English key is declared twice', twice(enKeys).length === 0);
if (twice(enKeys).length) console.log(`        duplicated: ${twice(enKeys).join(', ')}`);

// The markup carries Persian text inside every [data-t] element so the page reads
// correctly before app.js runs — or if it fails to run at all. That copy has to agree with
// the dictionary, or a broken script shows text the app itself would never show.
const faValues = new Map([...faBlock.matchAll(/^ {4}([a-zA-Z]+): '((?:[^'\\]|\\.)*)'/gm)]
  .map((m) => [m[1], m[2].replace(/\\'/g, "'")]));
const pristine = install(html);      // a parse app.js has never touched
const stale = pristine.document.querySelectorAll('[data-t]')
  .filter((node) => faValues.has(node.dataset.t) && node.textContent.trim() !== faValues.get(node.dataset.t))
  .map((node) => node.dataset.t);
check('the fallback text in the markup matches the Persian dictionary', stale.length === 0);
if (stale.length) console.log(`        drifted: ${[...new Set(stale)].join(', ')}`);
check('the static <title> is the Persian docTitle, for a page that never runs its script',
      new RegExp(`<title>${faValues.get('docTitle')}</title>`).test(html));

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
// Two buttons carry that number — the undertray one on a desktop, the in-card one on a
// phone — and only one of them used to be redrawn. Since each build shows a different one,
// the wrong label was invisible on whichever machine you happened to be testing.
check('and so does the phone button, which shows the same count on the card',
      el('batch-native-label').textContent.includes('5'));
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
check('the theme button title is translated', el('theme').title === 'Auto theme');
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
await sleep(10);
check('erasing asks for confirmation', !el('confirm').hidden);
// The dialog used to open titled "undefined" with an "undefined" confirm button, because the
// code asked for a key the dictionary no longer had. Assert real copy is on both, not just
// that the dialog appeared — the old bug appeared just fine.
check('the dialog is titled, not "undefined"',
      el('confirm-title').textContent.trim().length > 0 && el('confirm-title').textContent !== 'undefined');
check('the confirm button is labelled, not "undefined"',
      el('confirm-action').textContent.trim().length > 0 && el('confirm-action').textContent !== 'undefined');
el('confirm-action').dispatch('click');
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
const nativeDom = install(html);
nativeDom.matchMedia = () => ({ matches: true });
Object.assign(globalThis, nativeDom);
globalThis.Capacitor = { getPlatform: () => 'android' };
analysis = null;                                    // no archive loaded in this copy
await import(`${mod('app.js')}?native=1`);             // query string defeats the module cache
const nel = (id) => nativeDom.document.getElementById(id);
check('the root is flagged so the CSS can respond',
      nativeDom.document.documentElement.dataset.native === 'true');
check('the keyboard row is hidden with no keyboard to press', nel('keys').hidden);
// Visibility here is CSS, so these two are greps — but greps for the exact selector, since
// the point is which of the two controls in that row goes. The duplicate button goes (the
// card carries its own); the size selector stays, because the user asked for a count they
// could set and a phone is where a batch of fifty is felt most.
check('the undertray copy of the batch button is gated in CSS, not left visible',
      cssSource.includes(':root[data-native="true"] #act-batch,'));
check('but the count is still the phone user\'s to choose',
      !/:root\[data-native="true"\][^,{]*\.batch\s*[,{]/.test(cssSource)
      && nel('batch-size') !== null);
check('one-at-a-time still works: the open button is there', nel('act-open') !== null);

// The file filter is the bug that made the app look broken on a phone: Android's document
// picker filters by MIME type, and a ZIP from Downloads or Telegram is often reported as
// application/octet-stream, so the archive was greyed out and unselectable.
check('neither file input filters by type on Android',
      !nel('file').hasAttribute('accept') && !nel('file2').hasAttribute('accept'));
// Not "is styled visible": the attribute has to go, or assistive technology and the
// stylesheet disagree about whether the button is there.
check('the in-card batch button is exposed on Android, not merely styled visible',
      nel('act-batch-native') !== null && !nel('act-batch-native').hidden);
check('the welcome card asks for no browser permission on Android',
      nel('welcome-body').textContent === faValues.get('welcomeNativeReady'));
check('and does not mention pop-ups, which a phone has no control for',
      !nel('welcome-body').textContent.includes('pop-up'));

// The blocked-pop-up message used to send a phone user to the address bar. Load a queue in
// this copy and take the failing path for real rather than reading the dictionary.
analysis = { account_username: 'ashka',
  stats: { followers: 1, following: 3, remaining: 2, mutuals: 1, win_rate: 33.3, ratio: 0.33 },
  not_following: people.slice(0, 2), ignored_files: [] };
server.history = [];
nel('file').dispatch('change', { target: { files: [{ name: 'phone.zip' }] } });
await sleep(20);
nativeDom.popupsBlocked = true;
nel('act-open').dispatch('click');
await sleep(20);
check('a phone user is still told when nothing opened', !nel('notice').hidden);
check('and is not sent to an address bar the app does not have',
      !nel('notice-text').textContent.includes('نوار آدرس'));
check('the phone message names a remedy that exists on a phone',
      nel('notice-text').textContent.includes('مرورگر پیش‌فرض'));
nativeDom.popupsBlocked = false;
server.history = [];

delete globalThis.Capacitor;
// Put the browser copy back. Every helper here resolves `document` at call time, so leaving
// the native DOM installed would quietly point el() — and every section below, all of which
// describe the browser build — at the wrong copy. This file used to do exactly that.
Object.assign(globalThis, globals);

console.log('\n[16] Theme toggle has three states');
check('theme starts in system mode', document.documentElement.dataset.themeMode === 'system');
el('theme').dispatch('click');
check('first click switches to light', document.documentElement.dataset.themeMode === 'light');
check('the light glyph is shown', el('theme-glyph').textContent === '☀');
check('the theme title is translated', el('theme').title === 'حالت روشن');
el('theme').dispatch('click');
check('second click switches to dark', document.documentElement.dataset.themeMode === 'dark');
check('the dark glyph is shown', el('theme-glyph').textContent === '☾');
el('theme').dispatch('click');
check('third click returns to system', document.documentElement.dataset.themeMode === 'system');
check('the system glyph is shown', el('theme-glyph').textContent === '◐');
check('the choice is persisted', localStorage.getItem('theme') === 'system');

console.log('\n[17] Welcome card: what a first-time user actually meets');
// A third copy on a fresh DOM. The primary copy has an archive on the desk, so its welcome
// card is correctly hidden and cannot answer "what does a new user see?". Pop-ups are
// blocked before boot because that failure — a batch of fifty silently swallowed — is the
// whole reason this card exists.
const firstRun = install(html);
firstRun.matchMedia = () => ({ matches: true });
firstRun.popupsBlocked = true;
Object.assign(globalThis, firstRun);
analysis = null;
await import(`${mod('app.js')}?welcome=1`);
const wel = (id) => firstRun.document.getElementById(id);
check('the welcome card is visible on first run', !wel('welcome').hidden);
check('a blocked pop-up is reported before any batch is attempted',
      wel('welcome-body').textContent === faValues.get('welcomePopupsBlocked'));
check('the intro card still says where the archive comes from',
      wel('intro').textContent.includes('Download an archive'));
check('the welcome card does not repeat the card underneath it',
      !wel('welcome-body').textContent.includes('Download an archive'));

// Checking again has to re-run the probe, not repeat a cached answer from load time.
firstRun.popupsBlocked = false;
wel('welcome-check').dispatch('click');
check('checking again after allowing pop-ups confirms instead of warning',
      wel('welcome-body').textContent === faValues.get('welcomeReady'));

// What Safari's private mode and "block all cookies" do: writes throw. Every localStorage
// call in app.js is wrapped, so the app should report this rather than fall over.
const realSetItem = firstRun.localStorage.setItem;
firstRun.localStorage.setItem = () => { throw new Error('storage is blocked'); };
wel('welcome-check').dispatch('click');
check('a blocked store is reported too, not discovered when history vanishes',
      wel('welcome-body').textContent === faValues.get('welcomeStorageBlocked'));
firstRun.localStorage.setItem = realSetItem;

wel('welcome-check').dispatch('click');
check('with both working, the card gets out of the way',
      wel('welcome-body').textContent === faValues.get('welcomeReady'));
wel('welcome-dismiss').dispatch('click');
check('dismissing hides the card', wel('welcome').hidden);
check('dismissal is remembered', firstRun.localStorage.getItem('welcomeDismissed') === 'true');
wel('welcome-help').dispatch('click');
check('the help button in the masthead brings it back', !wel('welcome').hidden);
firstRun.document.body.dispatch('keydown', { target: { tagName: 'BODY' }, key: 'Escape' });
check('Escape dismisses it as well', wel('welcome').hidden);
Object.assign(globalThis, globals);      // back to the browser copy, as in [15]

console.log('\n[18] The batch fallback is native-only, in both directions');
check('the in-card batch button stays hidden in the browser', el('act-batch-native').hidden);
check('the browser keeps the tray it can use instead', el('act-batch') !== null);
check('CSS hides the native batch button by default', cssSource.includes('.btn--native-batch { display: none; }'));
check('CSS shows the native batch button on native', cssSource.includes(':root[data-native="true"] .btn--native-batch { display: inline-flex; }'));
check('tap targets are at least 44 dp', cssSource.includes('min-height: 44px'));
// The four insets have one owner each, and the top one is the subtle case. The body pads
// the left/right/bottom; the sticky masthead pads its own top so its background fills the
// status-bar strip and stays there on scroll. Getting this wrong is invisible on a desktop.
check('the body owns the side and bottom insets but not the top',
      /body \{[^}]*padding: 0 env\(safe-area-inset-right\) env\(safe-area-inset-bottom\) env\(safe-area-inset-left\)/.test(cssSource));
check('the masthead owns the top inset, so a notch cannot clip the header',
      /\.masthead \{[^}]*padding: calc\(0\.85rem \+ env\(safe-area-inset-top\)\)/.test(cssSource));
// The top inset belongs to the screen, not to Capacitor, so it must not be re-added under
// [data-native]. It was, on top of a body that also padded for it, spacing the header twice.
check('no native rule pads the masthead top a second time',
      !/\[data-native="true"\] \.masthead \{[^}]*safe-area-inset-top/.test(cssSource));
// The structural rule behind those two: an inset may only be spent by a box that is out of
// normal flow, because the body already pads the flow for three of the four edges. Any other
// rule that names an inset is double-counting it — which is precisely the bug that put a gap
// under the card and spaced the header twice. Walk every rule that references an inset and
// require it to be `body` or to position itself fixed/sticky. Comments are stripped first,
// since several of them name the insets while explaining why.
const cssBare = cssSource.replace(/\/\*[\s\S]*?\*\//g, '');
const insetOffenders = [...cssBare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter((m) => /env\(safe-area-inset/.test(m[2]))
  .filter((m) => m[1].trim() !== 'body' && !/position:\s*(fixed|sticky)/.test(m[2]))
  .map((m) => m[1].trim().replace(/\s+/g, ' '));
check('every safe-area inset is spent by the body or an out-of-flow box, never twice',
      insetOffenders.length === 0);
if (insetOffenders.length) console.log(`        in normal flow: ${insetOffenders.join(' | ')}`);

console.log('\n[19] The archive filter is widened only where it breaks, and by no plugin');
check('the page ships a narrow filter for browsers, which report real MIME types',
      pristine.document.getElementById('file').getAttribute('accept') === '.zip,application/zip'
      && pristine.document.getElementById('file2').getAttribute('accept') === '.zip,application/zip');
check('the browser build keeps it', el('file').getAttribute('accept') === '.zip,application/zip'
      && el('file2').getAttribute('accept') === '.zip,application/zip');
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
check('no file-picker plugin was added to do this',
      !deps.some((d) => d.includes('file-picker') || d.includes('filesystem')));
// A previous attempt called Filesystem.pickFiles, which does not exist in any installed
// package. It read as a working code path in a report and cost a full round trip.
check('nothing calls a pickFiles API that is not installed', !source.includes('pickFiles'));

console.log('\n[20] The tab title follows the language');
check('the tab title starts Persian', document.title === faValues.get('docTitle'));
el('lang').dispatch('click');
check('switching to English retitles the tab with no reload', document.title === 'Follow Triage Desk');
el('lang').dispatch('click');
check('and switching back restores it', document.title === faValues.get('docTitle'));

console.log('\n[21] The remembered archive is a reminder, and nothing about anyone');
analysis = { account_username: 'ashka',
  stats: { followers: 2, following: 5, remaining: 3, mutuals: 2, win_rate: 40, ratio: 0.4 },
  not_following: people.slice(0, 3), ignored_files: [] };
server.history = [];
const chosen = { name: 'twitter-2026-05-01-abcdef.zip', size: 84213770, lastModified: 1714500123456 };
el('file').dispatch('change', { target: { files: [chosen] } });
await sleep(20);
const stored = JSON.parse(localStorage.getItem('x_last_archive'));
check('a successful read is remembered', stored !== null);
// Deliberately exact rather than a spot check: this is the one place the app writes to
// storage outside history_store.py, and a later change must not quietly add a username.
check('the record is exactly the file description, with nothing else in it',
      JSON.stringify({ ...stored, readAt: 0 })
      === JSON.stringify({ name: chosen.name, size: chosen.size, lastModified: chosen.lastModified, readAt: 0 }));
check('the read time is a real timestamp',
      typeof stored.readAt === 'number' && Math.abs(Date.now() - stored.readAt) < 60000);
// A returning user meets the intro card, so that is where the reminder has to appear. The
// failed read below is how the card comes back without reloading the page.
analysis = null;
el('file').dispatch('change', { target: { files: [{ name: 'not-an-archive.txt' }] } });
await sleep(20);
check('the intro card names the archive for a returning user',
      el('last-archive').textContent.includes(chosen.name));
check('and says how long ago, not just which one',
      el('last-archive').textContent.includes(faValues.get('justNow')));
check('the reminder does not promise it can reopen the file by itself',
      !el('last-archive').textContent.includes(faValues.get('chooseFile')));
el('forget').dispatch('click');
await sleep(10);
el('confirm-action').dispatch('click');
await sleep(20);
check('erasing history forgets the archive too', localStorage.getItem('x_last_archive') === null);
check('and the intro card stops naming it', !el('last-archive').textContent.includes(chosen.name));

console.log('\n[22] The read bar is driven by the reader');
check('the busy stage has a bar to drive', el('busy-spool') !== null);
// Asserting the width after the read finished proves nothing: it is zero whether or not
// the bar was reset, because nothing ever moved it. So leave the bar part-full, start a
// read, and let the fake server record the width at the moment the request arrives.
el('busy-spool').style.width = '43%';
analysis = null;
el('file').dispatch('change', { target: { files: [{ name: 'again.txt' }] } });
await sleep(20);
check('a new read starts the bar from empty, not where the last one stopped',
      barAtRequest.at(-1) === '0%');
check('and a failed read does not leave it stuck part-way', el('busy-spool').style.width === '0%');
check('app.js feeds the reader fraction straight to the bar',
      source.includes('onProgress: ({ fraction }) => setReadProgress(fraction)'));
check('no timer invents progress', !/set(Interval|Timeout)\([^)]*ReadProgress/.test(source));
// Whether the fractions themselves behave — never going backwards across the directory
// and read passes, arriving at 1 when the work is done — is checked in test_analyzer.mjs,
// where the real reader runs over a real archive. A grep here would only look like proof.

console.log('\n[23] The phone layout puts the decision under the thumb');
const fixedBar = cssSource.match(/\.card--live \.card__actions \{[^}]*position: fixed[^}]*\}/g) || [];
check('the fixed action bar is declared exactly once', fixedBar.length === 1);
check('it clears the home-bar inset', fixedBar[0]?.includes('env(safe-area-inset-bottom)') === true);
// Two classes on purpose: the narrow-screen block later in the file sets .card's padding
// shorthand, and at equal specificity the later rule wins — which put the fixed bar on top
// of the card's own content on every phone under 480px. The clearance is derived from
// --reach-bar rather than a typed 5rem, so the bar and the room reserved for it can never
// disagree.
check('the card reserves room for the bar, derived from its height, not a magic number',
      /\.card\.card--live \{ padding-bottom: calc\(var\(--reach-bar\)[^}]*\}/.test(cssSource));
check('the desktop reset is scoped so the native build stays thumb-first',
      cssSource.includes(':root:not([data-native="true"]) .card--live .card__actions'));
check('and the reset gives the card its padding back too',
      cssSource.includes(':root:not([data-native="true"]) .card.card--live'));
const odometer = cssSource.match(/\.odometer \{[^}]*font-size: clamp\(([\d.]+)rem/);
check('the counter is not at its smallest where it is the only thing on screen',
      odometer !== null && Number(odometer[1]) >= 4);
const deck = cssSource.match(/\.deck \{[^}]*min-height: ([^;]+);/);
check('the deck yields on a short viewport instead of pushing the bar off screen',
      deck !== null && deck[1].includes('vh'));

console.log('\n[24] Touch hygiene: hover never fires on a screen you tap');
// On a touch screen :hover sticks after a tap until you press elsewhere, so a button keeps
// the look of being pressed and a table row looks selected. Every :hover rule therefore has
// to sit inside @media (hover: hover). Mask those blocks out by brace-matching and assert no
// :hover survives in a code line — a comment mentioning the word is fine.
const withoutHoverBlocks = (() => {
  const needle = '@media (hover: hover) {';
  let out = '', i = 0;
  for (;;) {
    const at = cssSource.indexOf(needle, i);
    if (at === -1) { out += cssSource.slice(i); break; }
    out += cssSource.slice(i, at);
    let depth = 0, j = at + needle.length - 1;
    for (; j < cssSource.length; j++) {
      if (cssSource[j] === '{') depth++;
      else if (cssSource[j] === '}' && --depth === 0) break;
    }
    i = j + 1;
  }
  return out;
})();
// A real rule carries a brace on the same line in this stylesheet's one-line-per-rule style;
// the prose explaining why hover is gated does not, and must not fail its own check.
const strayHover = [...withoutHoverBlocks.matchAll(/^.*:hover.*$/gm)]
  .map((m) => m[0].trim())
  .filter((line) => line.includes('{'));
check('no :hover rule sits outside an @media (hover: hover) block',
      strayHover.length === 0);
if (strayHover.length) strayHover.forEach((l) => console.log(`        stray: ${l}`));
// The controls that lose hover need a pressed state in its place, or a tap gives no feedback
// at all on the phone.
check('buttons answer a tap with :active since they cannot hover',
      /\.btn:active \{/.test(cssSource));
check('the interactive surfaces kill the tap flash and the 300ms zoom delay',
      cssSource.includes('-webkit-tap-highlight-color: transparent') &&
      cssSource.includes('touch-action: manipulation'));

console.log('\n[25] The error toast clears the decision bar it would otherwise cover');
// The bar is fixed to the bottom edge on the phone; a toast pinned to bottom:1rem lands on
// the very buttons it names. It has to sit one bar-height plus the safe area above the edge,
// and paint above the bar, not behind it.
// Anchor to a line-start .notice so this reads the base rule, not the scoped
// ':root:not([data-native]) .notice { bottom: 1rem }' reset that appears earlier in the file.
const noticeRule = cssSource.match(/^\.notice \{[^}]*\}/m);
check('the toast is lifted by the same --reach-bar the card uses',
      noticeRule !== null && /bottom: calc\(var\(--reach-bar\)/.test(noticeRule[0]));
check('the toast clears the home-bar inset as well',
      noticeRule !== null && noticeRule[0].includes('env(safe-area-inset-bottom)'));
check('and it paints above the fixed bar, never behind it',
      noticeRule !== null && fixedBar[0] != null &&
      Number(noticeRule[0].match(/z-index: (\d+)/)?.[1]) > Number(fixedBar[0].match(/z-index: (\d+)/)?.[1]));
// The native block used to re-pin the toast to the bottom corner with a more specific
// selector, defeating the lift on the one surface that always has a fixed bar. It must not
// come back without carrying --reach-bar with it.
check('no native rule drops the toast back onto the bar',
      !/\[data-native="true"\] \.notice \{[^}]*bottom:(?![^}]*--reach-bar)/.test(cssSource));
// Only where the bar goes static (roomy, non-touch) does the toast return to the corner.
check('the toast returns to the corner only where the bar is no longer fixed',
      /:root:not\(\[data-native="true"\]\) \.notice \{ bottom: 1rem; \}/.test(cssSource));

console.log('\n[26] The ledger stays reference material on a phone, not a second card');
// Brace-match the narrow-screen block, because every selector below also exists at full width
// with the opposite value. A whole-file grep for '.rail {' finds the desktop panel first and
// would pass no matter what the phone does.
const narrowBlock = (() => {
  const needle = '@media (max-width: 56rem) {';
  const at = cssSource.indexOf(needle);
  if (at === -1) return '';
  let depth = 0, j = at + needle.length - 1;
  for (; j < cssSource.length; j++) {
    if (cssSource[j] === '{') depth++;
    else if (cssSource[j] === '}' && --depth === 0) break;
  }
  return cssSource.slice(at, j + 1);
})();
check('there is a narrow-screen block to read', narrowBlock.length > 0);
// Beside the card the rail's slab reads as a margin note. Stacked underneath it reads as a
// second sheet of paper, competing with the one account you are meant to be deciding on.
const narrowRail = narrowBlock.match(/\n {2}\.rail \{[^}]*\}/);
check('the rail sheds its panel background once it sits under the work',
      narrowRail !== null && /background: none/.test(narrowRail[0]));
check('and its box, keeping one rule to divide it from the work',
      narrowRail !== null && /border: 0/.test(narrowRail[0]) &&
      /border-top: 1px solid var\(--rule\)/.test(narrowRail[0]));
check('while the full-width rail keeps the panel it needs beside the card',
      /^\.rail \{[^}]*background: color-mix/m.test(cssSource));
// Four short figures in one row read at a glance; the same four stacked read as a list of
// almost nothing and push the foot of the rail below the fold.
check('the four figures sit in a single row of four',
      /\.rail \.figures \{[^}]*grid-template-columns: repeat\(4, 1fr\)/.test(narrowBlock));
check('each figure stacks its label over its number instead of flinging them apart',
      /\.rail \.figure \{[^}]*flex-direction: column/.test(narrowBlock));
check('a hairline rules each figure off from the next',
      /\.rail \.figure \{[^}]*border-inline-start: 1px solid var\(--rule\)/.test(narrowBlock));
check('except the first, which has nothing before it to be ruled off from',
      /\.rail \.figure:first-child \{ border-inline-start: 0; \}/.test(narrowBlock));
// An invariant, not an enumeration: this stays true however many breakpoints are added later.
// The rule it replaces lived in the 30rem block, three media queries away from the one that
// set the columns in the first place.
const figureColumns = [...cssSource.matchAll(/\.rail \.figures \{([^}]*)\}/g)]
  .map((m) => m[1].match(/grid-template-columns:\s*([^;]+)/)?.[1]?.trim())
  .filter(Boolean);
check('no breakpoint collapses the ledger back to a single column',
      figureColumns.length > 0 && figureColumns.every((value) => value !== '1fr'));
// The rail is the last thing on the page and its last control erases the history, so it is
// the one button that must not sit under the fixed bar. 4rem was a guess, and --reach-bar is
// 68px: the bottom of the erase button was behind the bar by exactly the difference.
const narrowDesk = narrowBlock.match(/\.desk \{[^}]*\}/);
check('the page reserves the bar its own height under the rail, derived not guessed',
      narrowDesk !== null && /padding-bottom: calc\(var\(--reach-bar\)/.test(narrowDesk[0]));
check('and stops reserving it where the bar is back in the flow',
      /:root:not\(\[data-native="true"\]\) \.desk \{ padding-bottom: 4rem; \}/.test(cssSource));

console.log('\n[27] A panel the controller hides is a panel the stylesheet hides');
// This is the one class of bug the fake DOM structurally cannot see. It stores the `hidden`
// attribute and runs no cascade, so `el('notice').hidden = true` reports success here while a
// real browser keeps painting the toast: `[hidden] { display: none }` is the *browser's* rule,
// and any author declaration outranks the user-agent origin on origin alone, however weak its
// selector. `.notice { display: flex }` was enough. Seven panels were affected.
//
// So the invariant is read off the two files instead of off the shim: resolve, for each panel
// the controller hides, which display declaration actually wins while the attribute is set.
const cssRules = [...cssBare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((m, order) => {
  const decl = /(?:^|[;\s])display\s*:\s*([^;]+)/.exec(m[2]);
  if (!decl) return [];
  const value = decl[1].trim();
  // A comma list is several rules wearing one prelude, and it may wrap across lines — the
  // `.keys, kbd` pair does. Splitting keeps each selector's own specificity.
  return m[1].trim().split(',').map((part) => ({
    selector: part.trim().replace(/\s+/g, ' '),
    value: value.replace(/\s*!important$/, ''),
    important: /!important/.test(value),
    order,
  })).filter((rule) => rule.selector.length > 0);
});
check('app.css yields display rules to resolve', cssRules.length > 20);

// Enough of the real algorithm to rank these selectors: importance first, then specificity,
// then source order. Approximate on exotic selectors, exact on everything this file contains.
const weigh = (selector) => {
  const bare = selector.replace(/::[\w-]+/g, ' ');
  const ids = (bare.match(/#[\w-]+/g) || []).length;
  const mid = (bare.match(/\.[\w-]+/g) || []).length + (bare.match(/\[[^\]]*\]/g) || []).length
            + (bare.match(/:(?!not\()[\w-]+/g) || []).length;
  const tags = (bare.replace(/[#.][\w-]+|\[[^\]]*\]|:[\w-]+(?:\([^)]*\))?/g, ' ')
                   .match(/[a-zA-Z][\w-]*/g) || []).length;
  return ids * 10000 + mid * 100 + tags;
};

// Every element the controller hides by attribute, including the ones it reaches through a
// local const. Read from the source rather than listed by hand, so a panel added tomorrow is
// held to the same rule without anyone remembering to come back here.
const hiddenTargets = new Set([...source.matchAll(/el\('([\w-]+)'\)\.hidden\s*=/g)].map((m) => m[1]));
for (const [, name, id] of source.matchAll(/const (\w+) = el\('([\w-]+)'\)/g)) {
  if (new RegExp(`\\b${name}\\.hidden\\s*=`).test(source)) hiddenTargets.add(id);
}
check('the controller is read to hide panels by attribute, not by class', hiddenTargets.size >= 10);
// The extractor must not be able to pass by finding nothing: these are the panels whose display
// rules made the attribute inert, and they have to be in the set for the resolution below to
// mean anything.
check('and the panels that were inert are among them',
      ['notice', 'keys', 'split', 'tally', 'undertray', 'views'].every((id) => hiddenTargets.has(id)));

const stillVisible = [];
let resolved = 0;
for (const id of [...hiddenTargets].sort()) {
  const node = pristine.document.getElementById(id);
  if (!node) continue;                       // section [1] owns the markup's shape
  const was = node.hidden;
  node.hidden = true;                        // ask the question in the state that matters
  const winner = cssRules
    .filter((rule) => {
      try { return pristine.document.querySelectorAll(rule.selector).includes(node); }
      catch { return false; }                // a selector the shim cannot parse cannot match
    })
    .sort((a, b) => (a.important - b.important)
                 || (weigh(a.selector) - weigh(b.selector))
                 || (a.order - b.order))
    .pop();
  node.hidden = was;
  if (!winner) continue;                     // nothing gives it a box; the browser's rule stands
  resolved += 1;
  if (winner.value !== 'none') stillVisible.push(`#${id} -> ${winner.selector} { display: ${winner.value} }`);
}
check('the resolution reaches panels that app.css does give a display to', resolved >= 6);
check('and with the attribute set, every one of them resolves to display: none', stillVisible.length === 0);
if (stillVisible.length) console.log(`        still painted: ${stillVisible.join(' | ')}`);
// The fix is one unconditional rule rather than one override per panel, because the overrides
// are what failed: three existed and the next seven were simply forgotten.
check('the guard is unconditional, so it covers panels not written yet',
      cssRules.some((rule) => rule.selector === '[hidden]' && rule.value === 'none' && rule.important));
// !important is load-bearing, not decoration. Author `[hidden]` and author `.notice` carry the
// same specificity, so without it the later rule wins and the panel with a display keeps it.
check('nothing else in app.css forces a display, so nothing can outrank it',
      cssRules.filter((rule) => rule.important).length === 1);

console.log('\n[28] A thumb can brush the card aside, and only aside');
// A fresh archive with ids nothing earlier in this file has recorded, so the queue is known
// rather than whatever twenty-eight sections left behind.
analysis = {
  account_username: 'ashka',
  stats: { followers: 40, following: 100, remaining: 4, mutuals: 93, win_rate: 93.0, ratio: 0.4 },
  not_following: Array.from({ length: 4 }, (_, i) => ({
    account_id: String(5000 + i), username: `swipe${i}`, url: `https://x.com/swipe${i}`,
  })),
  ignored_files: [],
};
el('file').dispatch('change', { target: { files: [{ name: 'archive.zip' }] } });
await sleep(20);
check('the swipe fixture is on the card', el('card-handle').textContent === '@swipe0');

// One finger arriving, travelling, and leaving. Two moves rather than one because the axis is
// decided on the first and the distance on the last, and a single jump would hide that.
const swipe = (travelX, travelY = 0, opts = {}) => {
  const card = opts.card ?? el('card');
  const pointerId = opts.pointerId ?? 1;
  const pointerType = opts.pointerType ?? 'touch';
  const target = opts.target ?? card;
  const [x0, y0] = [200, 300];
  const at = (fraction) => ({
    pointerId, pointerType, target,
    clientX: x0 + travelX * fraction, clientY: y0 + travelY * fraction,
  });
  card.dispatch('pointerdown', at(0));
  card.dispatch('pointermove', at(0.5));
  card.dispatch('pointermove', at(1));
  const midFlight = {
    transform: card.style.transform,
    opacity: card.style.opacity,
    dragging: card.classList.contains('is-dragging'),
    captured: card.capturedPointer,
  };
  card.dispatch('pointerup', at(1));
  return midFlight;
};

// The one that matters most. A phone scrolls by dragging, so a flick down the page crosses the
// card every time; if that deferred an account, the queue would quietly reorder itself while
// someone was only trying to read the rail.
const beforeScroll = el('card-handle').textContent;
const scrollFlick = swipe(5, 90);
check('a flick down the page is the page scrolling, not a decision',
      el('card-handle').textContent === beforeScroll);
check('and the card never claimed the pointer the browser needed for it',
      scrollFlick.dragging === false && scrollFlick.captured == null);
// A thumb scrolling is rarely plumb vertical, so the guard has to be about which axis *wins*,
// not about whether the finger moved sideways at all. 40 across while travelling 90 down is a
// scroll — and it clears the 10px minimum, so that threshold alone would let it through.
const beforeSlant = el('card-handle').textContent;
const slantFlick = swipe(40, 90);
check('a slanted scroll is still a scroll, because the dominant axis decides',
      el('card-handle').textContent === beforeSlant && slantFlick.dragging === false);
// The case the axis test cannot reach: no finger holds still, so a plain tap on the paper drifts
// a few pixels — and sideways drift beats no vertical drift on dominance alone. Without a minimum
// travel, every tap would twitch the card and take the pointer away from the button under it.
const jitter = swipe(6, 2);
check('a tap that wobbles is still a tap, because a few pixels are not a gesture',
      jitter.dragging === false && jitter.transform === '' && jitter.captured == null);

// offsetWidth is 100 under the shim, so commitDistance() is max(56, 28) = 56: a 30px drag is
// short of it and a 70px drag clears it.
const beforeShort = el('card-handle').textContent;
const shortDrag = swipe(30);
check('a short drag tracks the finger', shortDrag.dragging === true &&
      shortDrag.transform.includes('translateX(30px)'));
check('the paper turns as it slides, so it reads as a sheet and not a slider',
      /rotate\(0\.5deg\)/.test(shortDrag.transform));
check('but too short to mean anything, so the account stays put',
      el('card-handle').textContent === beforeShort);
check('and the card is put back rather than left where the finger stopped',
      el('card').style.transform === '' && el('card').style.opacity === '');
check('released with the transition on, so it springs back instead of snapping',
      el('card').classList.contains('is-settling'));

const beforeCommit = el('card-handle').textContent;
const countBefore = el('odometer-text').textContent;
const committed = swipe(70);
check('a committed drag takes the pointer, so the card hears the finger past its own edge',
      committed.captured === 1);
check('it fades as it goes', Number(committed.opacity) < 1 && Number(committed.opacity) >= 0.35);
check('brushing the card aside defers the account', el('card-handle').textContent !== beforeCommit);
check('deferring is not progress, so the counter does not move',
      el('odometer-text').textContent === countBefore);
check('and nothing was recorded for a gesture that only deferred',
      !server.history.includes('5000'));
check('the pointer is handed back afterwards', el('card').capturedPointer === null);
check('and the card is clean for the next account, not stuck mid-flick',
      el('card').style.transform === '' && !el('card').classList.contains('is-dragging'));

// The other direction does the same thing on purpose: open-and-record leaves the app and
// retires the account for good, so it stays a deliberate tap. A gesture you can make by
// accident must not be the destructive one.
const beforeLeft = el('card-handle').textContent;
swipe(-70);
check('the other direction defers too, rather than doing the irreversible thing',
      el('card-handle').textContent !== beforeLeft && !server.history.includes('5001'));
check('and still recorded nothing', server.history.filter((id) => id.startsWith('500')).length === 0);

const beforeMouse = el('card-handle').textContent;
const mouseDrag = swipe(70, 0, { pointerType: 'mouse' });
check('a mouse drag is left alone — a cursor already has buttons in front of it',
      el('card-handle').textContent === beforeMouse && mouseDrag.dragging === false);

const beforeButton = el('card-handle').textContent;
swipe(70, 0, { target: el('act-skip') });
check('a drag that starts on a button is that button\'s press, not the card\'s',
      el('card-handle').textContent === beforeButton);

// The CSS half of the same promise: `pan-y` is what leaves vertical scrolling with the browser,
// so the guard above is belt and braces rather than the only thing standing between a thumb and
// a lost place in the queue.
check('the stylesheet gives the browser vertical scrolling and keeps only the sideways travel',
      /\.card--live \{ touch-action: pan-y; \}/.test(cssSource));
check('a card under the finger has no transition, so the paper cannot lag behind the hand',
      /\.card--live\.is-dragging \{ transition: none; \}/.test(cssSource));
check('and the transition belongs to the release', /\.card--live\.is-settling \{ transition: transform/.test(cssSource));

console.log('\n[29] The gesture announces itself once, and only where it exists');
// A gesture nobody is told about is a gesture nobody makes. The keyboard row cannot carry this
// news — it is hidden on the very devices that can swipe — so the note is the only thing that
// stands between the phone and an undiscoverable feature.
const swipeFixture = () => ({
  account_username: 'ashka',
  stats: { followers: 40, following: 100, remaining: 3, mutuals: 93, win_rate: 93.0, ratio: 0.4 },
  not_following: Array.from({ length: 3 }, (_, i) => ({
    account_id: String(6000 + i), username: `hint${i}`, url: `https://x.com/hint${i}`,
  })),
  ignored_files: [],
});
const drop = (dom) => {
  dom.document.getElementById('file').dispatch('change', { target: { files: [{ name: 'a.zip' }] } });
  return sleep(20);
};

// The main copy is a touch device under the shim and section [28] already brushed a card aside
// in it, so the note has done its job and should be gone.
check('one brush aside is the whole lesson, so the note comes down', el('hint').hidden);
check('and the lesson is written down, not just remembered in the tab',
      localStorage.getItem('swipeLearned') === 'true');

// A phone that has never swiped: the state the note exists for.
const touchDom = install(html);
touchDom.matchMedia = () => ({ matches: true });
Object.assign(globalThis, touchDom);
analysis = swipeFixture();
await import(`${mod('app.js')}?touch=1`);
const tel = (id) => touchDom.document.getElementById(id);
check('with no archive open there is no card, so nothing is advertised', tel('hint').hidden);
await drop(touchDom);
check('once a card is on the desk the note appears', !tel('hint').hidden);
check('and it is written in the language the page loaded in',
      tel('hint').textContent.includes(faValues.get('swipeHint')));
// A phone browser is not the APK, but it has no Enter key either — so the row of keys goes and
// the note takes its place, rather than both stacking up under the deck.
check('a phone browser gets the note instead of a row of keys it cannot press',
      tel('keys').hidden);

// The note describes the card, so it has to leave with the card rather than hang under a table.
touchDom.document.querySelector('[data-view="all"]').dispatch('click');
check('leaving the deck for the full list takes the note with it', tel('hint').hidden);
touchDom.document.querySelector('[data-view="queue"]').dispatch('click');
check('and coming back to the deck brings it back, since it is still unlearned',
      !tel('hint').hidden);

const learned = swipe(70, 0, { card: tel('card') });
check('the fresh copy really did accept the gesture', learned.dragging === true);
check('and having made it once, the reader is not told again', tel('hint').hidden);
check('the phone writes it down for next time',
      touchDom.localStorage.getItem('swipeLearned') === 'true');

// The flag is only worth writing if it is read at boot. A fourth copy, launched with the flag
// already set, is the only way to prove the note does not come back tomorrow.
const relaunch = install(html);
relaunch.matchMedia = () => ({ matches: true });
relaunch.localStorage.setItem('swipeLearned', 'true');
Object.assign(globalThis, relaunch);
analysis = swipeFixture();
await import(`${mod('app.js')}?relaunch=1`);
await drop(relaunch);
check('a phone that learned the gesture yesterday is not taught it again',
      relaunch.document.getElementById('hint').hidden);
check('though the card it would have described is right there',
      !relaunch.document.getElementById('card').hidden);

// A mouse has buttons in front of it and cannot swipe at all, so the note would be a lie.
// Reduced motion stays on; only the pointer changes, so nothing else about this copy differs.
const mouseDom = install(html);
mouseDom.matchMedia = (query) => ({ matches: !/pointer:\s*coarse/.test(query) });
Object.assign(globalThis, mouseDom);
analysis = swipeFixture();
await import(`${mod('app.js')}?mouse=1`);
await drop(mouseDom);
check('a desktop is never told to drag a card its mouse cannot drag',
      mouseDom.document.getElementById('hint').hidden);
check('and it gets the keyboard row instead, so exactly one of the two speaks',
      !mouseDom.document.getElementById('keys').hidden);

Object.assign(globalThis, globals);      // back to the browser copy, as in [15] and [17]

// The note's mark drifts, which makes this the first infinite animation aimed at someone who may
// have asked the OS to stop things moving. Rather than exempt that one rule, check the blanket
// reset still covers everything the stylesheet animates — including animations not written yet.
const calmed = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(cssSource);
check('the stylesheet answers a request for less motion at all', calmed !== null);
const calmBody = calmed?.[1] ?? '';       // a missing block must fail these, not crash the file
check('and it does so for every element, not a list someone has to maintain',
      /\*, \*::before, \*::after \{[^}]*animation-duration: 0\.001ms !important/.test(calmBody));
check('an endless animation is also stopped after one pass, not merely sped up',
      /animation-iteration-count: 1 !important/.test(calmBody));
// `!important` is the load-bearing part: .hint__mark sets `animation` as a shorthand, which is
// a normal declaration in the same file and would otherwise win on source order.
check('the reset outranks the rules it is resetting',
      cssSource.includes('animation: hint-drift')
      && /animation-duration: 0\.001ms !important/.test(calmBody));

console.log(`\n${'='.repeat(52)}\n  ${ok} passed, ${fail} failed\n${'='.repeat(52)}`);
process.exit(fail ? 1 : 0);
