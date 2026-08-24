/**
 * app.js — the triage desk.
 *
 * The whole interface is one queue. An account is on the card, you either open it and
 * record the decision or push it back, and the count above the deck drops. The list
 * views are reference material for people who want to scan or search; they are not
 * where the work happens.
 *
 * Nothing here talks to the network except the optional local history API. The archive
 * is read in this tab by analyzer.js.
 */

import { analyzeArchive } from './analyzer.js';
import { ZipError } from './zip.js';
import { createHistory } from './history.js';

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------
// Copy rules followed here: name things by what the person does, keep one verb per
// action from button to confirmation, and make failures say what to do next.
const WORDS = {
  fa: {
    appName: 'میز تریاژ',
    docTitle: 'میز تریاژ فالو',
    appSub: 'هیچ داده‌ای از این دستگاه بیرون نمی‌رود',
    skipToWork: 'رفتن به صف',
    chooseFile: 'انتخاب آرشیو',
    newFile: 'آرشیو دیگر',
    toggleTheme: 'تغییر روشنایی',
    themeSystem: 'روشنایی خودکار',
    themeLight: 'حالت روشن',
    themeDark: 'حالت تاریک',
    switchLang: 'تغییر زبان',
    close: 'بستن',
    cancel: 'انصراف',
    ledger: 'دفتر حساب',
    figFollowing: 'فالو می‌کنی',
    figFollowers: 'فالوت می‌کنند',
    figMutual: 'دوطرفه',
    figCleared: 'رسیدگی‌شده',
    keyOneWay: 'یک‌طرفه',
    figRate: 'فالوبک گرفته‌ای',
    skippedFiles: 'فایل نادیده‌گرفته‌شده',
    skippedWhy: 'این فایل‌ها نامی شبیه فهرست فالوور دارند ولی فهرست فالوور نیستند، پس در شمارش نیامدند.',
    forgetAll: 'پاک کردن سابقه',
    storageServer: 'سابقه در پوشهٔ کاربری این سیستم ذخیره می‌شود.',
    storageDevice: 'سابقه فقط روی همین دستگاه و همین مرورگر ذخیره می‌شود.',
    leftInQueue: 'مانده در صف',
    viewQueue: 'صف',
    viewAll: 'فهرست کامل',
    viewDone: 'رسیدگی‌شده',
    welcomeEyebrow: 'خوش آمدی',
    welcomeLead: 'میز تریاژ فالو',
    welcomeCheck: 'بررسی کن',
    welcomeDismiss: 'متوجه شدم',
    welcomeHelp: 'راهنما',
    welcomeReady: 'همه‌چیز آماده است. هیچ داده‌ای از این دستگاه بیرون نمی‌رود؛ آرشیو را انتخاب کن.',
    welcomeNativeReady: 'اپ آماده است. آرشیو را انتخاب کن.',
    welcomePopupsBlocked: 'مرورگر باز شدن تب‌ها را مسدود کرده. اگر از «باز کردن دسته‌ای» استفاده می‌کنی، در نوار آدرس اجازهٔ pop-up بده و دوباره بررسی کن.',
    welcomeStorageBlocked: 'مرورگر ذخیره‌سازی را مسدود کرده. تصمیم‌ها بعد از بستن صفحه یادت نمی‌ماند.',
    lastArchive: 'آخرین آرشیو',
    lastArchiveNone: 'هنوز آرشیوی باز نشده',
    justNow: 'همین الان',
    timeAgo: (value, unit) => `${value} ${unit} پیش`,
    timeUnit: { second: 'ثانیه', seconds: 'ثانیه', minute: 'دقیقه', minutes: 'دقیقه', hour: 'ساعت', hours: 'ساعت', day: 'روز', days: 'روز' },
    introEyebrow: 'پروندهٔ جدید',
    introLead: 'آرشیو X را روی میز بگذار',
    introNote: 'فایل zip را از Settings → Your account → Download an archive بگیر، بعد انتخابش کن یا بکش اینجا. خواندنش کامل داخل همین صفحه انجام می‌شود.',
    introDrop: 'یا فایل را همین‌جا رها کن',
    busyEyebrow: 'در حال خواندن',
    busyLead: 'آرشیو باز می‌شود…',
    busyNote: 'فقط فایل‌های فالوور و فالویینگ از دل آرشیو استخراج می‌شوند، پس آرشیو چندگیگابایتی هم سریع خوانده می‌شود.',
    cardEyebrow: 'فالو می‌کنی، فالوبک نداده',
    cardId: 'آیدی',
    cardNoHandle: 'این آرشیو یوزرنیم را نگه نداشته؛ پروفایل با آیدی باز می‌شود.',
    openAndRecord: 'باز کردن و ثبت',
    skip: 'بعدی',
    swipeHint: 'کارت را به هر طرف بکش تا بعدی بیاید',
    stamped: 'ثبت شد',
    undo: 'برگرداندن',
    batchSize: 'تعداد',
    batchOpen: (n) => `باز کردن ${n} تای بعدی`,
    batchOpenNative: (n) => `باز کردن ${n} تای بعدی`,
    emptyEyebrow: 'صف تمام شد',
    emptyLead: 'همه را رسیدگی کردی',
    emptyNote: 'می‌توانی رسیدگی‌شده‌ها را ببینی، یا آرشیو تازه‌ای بگذاری تا از نو شمرده شود.',
    keyOpen: 'باز کردن و ثبت',
    keyBatch: 'دسته‌ای',
    findLabel: 'جست‌وجو در فهرست',
    findPlaceholder: 'جست‌وجوی یوزرنیم یا آیدی',
    thHandle: 'یوزرنیم',
    thId: 'آیدی',
    thAction: 'عملیات',
    rowOpen: 'باز کردن',
    rowUndo: 'برگرداندن به صف',
    noHandle: 'بدون یوزرنیم',
    sheetCount: (shown, total) => `${shown} از ${total}`,
    sheetMore: (n) => `${n} ردیف دیگر نمایش داده نشد؛ برای رسیدن به آن‌ها جست‌وجو کن.`,
    sheetNone: 'چیزی با این جست‌وجو پیدا نشد.',
    doneNone: 'هنوز چیزی ثبت نکرده‌ای.',
    queueDone: 'صف خالی است.',
    // failures
    errNotZip: 'این فایل zip نیست. همان فایل zip‌ی را انتخاب کن که از X دانلود کردی.',
    errEmpty: 'این فایل خالی است. دانلود آرشیو را کامل کن و دوباره امتحان کن.',
    errDamaged: 'این zip ناقص یا خراب است. آرشیو را دوباره از X دانلود کن.',
    errUnsupported: 'این zip با روش فشرده‌سازی‌ای ساخته شده که پشتیبانی نمی‌شود. آرشیو اصلی X را انتخاب کن.',
    errTooLarge: 'این فایل برای خواندن در مرورگر بزرگ‌تر از حد است. نسخهٔ دسکتاپ را استفاده کن.',
    errNoFollowData: 'در این آرشیو فهرست فالوور و فالویینگ نبود. آرشیو کامل حساب را انتخاب کن، نه فایل جداگانه.',
    errUnknown: 'خواندن این آرشیو ممکن نشد.',
    popupBlocked: 'مرورگر جلوی باز شدن تب‌ها را گرفت. در نوار آدرس اجازهٔ pop-up را برای این صفحه بده و دوباره بزن. هرچه باز نشد، سر جایش در صف ماند.',
    popupBlockedNative: 'پروفایل به مرورگر سیستم سپرده شد. اگر چیزی باز نشد، یک مرورگر پیش‌فرض تنظیم کن.',
    historyOffline: 'ثبت روی سرور انجام نشد. تا وقتی سرور برنگردد، این تصمیم‌ها بعد از بستن صفحه یادت نمی‌ماند.',
    confirmForget: 'همهٔ سابقهٔ رسیدگی پاک شود؟ بعد از این، هر پروفایل دوباره در صف می‌آید.',
  },
  en: {
    appName: 'Triage Desk',
    docTitle: 'Follow Triage Desk',
    appSub: 'Nothing leaves this device',
    skipToWork: 'Skip to the queue',
    chooseFile: 'Choose archive',
    newFile: 'Another archive',
    toggleTheme: 'Switch light and dark',
    themeSystem: 'Auto theme',
    themeLight: 'Light theme',
    themeDark: 'Dark theme',
    switchLang: 'Switch language',
    close: 'Close',
    cancel: 'Cancel',
    ledger: 'Ledger',
    figFollowing: 'You follow',
    figFollowers: 'Follow you',
    figMutual: 'Mutual',
    figCleared: 'Recorded',
    keyOneWay: 'One-way',
    figRate: 'follow you back',
    skippedFiles: 'files skipped',
    skippedWhy: 'These are named like follower lists but are not follower lists, so they were left out of the counts.',
    forgetAll: 'Erase history',
    storageServer: 'History is saved in this computer’s user folder.',
    storageDevice: 'History is saved on this device, in this browser only.',
    leftInQueue: 'Left in queue',
    viewQueue: 'Queue',
    viewAll: 'Full list',
    viewDone: 'Recorded',
    welcomeEyebrow: 'Welcome',
    welcomeLead: 'Follow Triage Desk',
    welcomeCheck: 'Check',
    welcomeDismiss: 'Got it',
    welcomeHelp: 'Help',
    welcomeReady: 'Everything is ready. Nothing leaves this device; pick your archive below.',
    welcomeNativeReady: 'The app is ready. Pick your archive below.',
    welcomePopupsBlocked: 'Your browser is blocking new tabs. If you use batch-open, allow pop-ups for this page in the address bar, then check again.',
    welcomeStorageBlocked: 'Your browser is blocking storage. Decisions will not be remembered after you close the page.',
    lastArchive: 'Last archive',
    lastArchiveNone: 'No archive opened yet',
    justNow: 'just now',
    timeAgo: (value, unit) => `${value} ${unit} ago`,
    timeUnit: { second: 'second', seconds: 'seconds', minute: 'minute', minutes: 'minutes', hour: 'hour', hours: 'hours', day: 'day', days: 'days' },
    introEyebrow: 'New case',
    introLead: 'Put your X archive on the desk',
    introNote: 'Get the .zip from Settings → Your account → Download an archive, then choose it here or drop it. It is read entirely inside this page.',
    introDrop: 'or drop the file here',
    busyEyebrow: 'Reading',
    busyLead: 'Opening the archive…',
    busyNote: 'Only the follower and following files are pulled out of the archive, so a multi-gigabyte export is still quick.',
    cardEyebrow: 'You follow them, they don’t follow back',
    cardId: 'ID',
    cardNoHandle: 'This archive kept no username, so the profile opens by ID.',
    openAndRecord: 'Open and record',
    skip: 'Next',
    swipeHint: 'Drag the card either way for the next one',
    stamped: 'Recorded',
    undo: 'Undo',
    batchSize: 'How many',
    batchOpen: (n) => `Open the next ${n}`,
    batchOpenNative: (n) => `Open next ${n}`,
    emptyEyebrow: 'Queue clear',
    emptyLead: 'You went through all of them',
    emptyNote: 'Look back over what you recorded, or drop in a fresh archive to count again.',
    keyOpen: 'Open and record',
    keyBatch: 'Batch',
    findLabel: 'Search the list',
    findPlaceholder: 'Search username or ID',
    thHandle: 'Username',
    thId: 'ID',
    thAction: 'Action',
    rowOpen: 'Open',
    rowUndo: 'Back to queue',
    noHandle: 'no username',
    sheetCount: (shown, total) => `${shown} of ${total}`,
    sheetMore: (n) => `${n} more rows are not shown — search to reach them.`,
    sheetNone: 'Nothing matches that search.',
    doneNone: 'You haven’t recorded anything yet.',
    queueDone: 'The queue is empty.',
    errNotZip: 'That file is not a .zip. Pick the .zip you downloaded from X.',
    errEmpty: 'That file is empty. Finish the download and try again.',
    errDamaged: 'That .zip is incomplete or damaged. Download the archive from X again.',
    errUnsupported: 'That .zip uses a compression method this reader does not support. Pick the original X archive.',
    errTooLarge: 'That file is too large to read in a browser. Use the desktop app for it.',
    errNoFollowData: 'No follower or following lists in that archive. Pick the full account archive, not a single file.',
    errUnknown: 'Could not read that archive.',
    popupBlocked: 'The browser blocked the new tabs. Allow pop-ups for this page in the address bar, then press it again. Anything that did not open stayed in the queue.',
    popupBlockedNative: 'The profile was handed to the system browser. If nothing opened, set a default browser.',
    historyOffline: 'That did not save to the server. Until it is back, these decisions won’t be remembered after you close the page.',
    confirmForget: 'Erase the whole review history? Every profile goes back into the queue.',
  },
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const el = (id) => document.getElementById(id);
const history = createHistory();

let lang = document.documentElement.lang === 'en' ? 'en' : 'fa';
let themeMode = document.documentElement.dataset.themeMode || 'system';
let welcomeDismissed = false;
let swipeLearned = false;
let oneWay = [];        // every account in this archive that does not follow back
let queue = [];         // the ones still to decide on, in working order
let view = 'queue';
let stats = null;
let skippedFiles = [];
let undoStack = [];     // batches of ids, newest last
let busyCard = false;   // guards double-fire while a card animates out
let stampTimers = [];   // in-flight stamp animation, so a new archive can cancel it

const t = (key) => WORDS[lang][key];
const groups = (n) => Number(n).toLocaleString('en-US');
const ROW_CAP = 400;

/**
 * True inside the Android build. There, window.open hands the URL to the system, so a
 * batch of ten would fire ten app-switches in a row and bury the queue under a stack
 * of X screens. One card at a time is the only sane shape on a phone, so the batch
 * tray is not offered — the keyboard row goes too, since there is no keyboard.
 */
const NATIVE = typeof globalThis.Capacitor !== 'undefined';
if (NATIVE) document.documentElement.dataset.native = 'true';
// The card gesture ignores a mouse, so the hint that advertises it belongs only where a finger
// is the primary input. NATIVE first because the APK's WebView is a phone by definition; the
// media query is what catches a phone browser, which the [data-native] flag never sees.
const TOUCH = NATIVE || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

// ---------------------------------------------------------------------------
// Chrome: language, theme, notices
// ---------------------------------------------------------------------------
function paintWords() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.title = t('docTitle');
  el('lang-label').textContent = lang === 'fa' ? 'EN' : 'فا';

  document.querySelectorAll('[data-t]').forEach((node) => {
    const value = WORDS[lang][node.dataset.t];
    if (typeof value === 'string') node.textContent = value;
  });
  document.querySelectorAll('[data-t-title]').forEach((node) => {
    node.title = WORDS[lang][node.dataset.tTitle] || node.title;
  });
  document.querySelectorAll('[data-t-placeholder]').forEach((node) => {
    node.placeholder = WORDS[lang][node.dataset.tPlaceholder] || node.placeholder;
  });
  document.querySelectorAll('[data-t-aria-label]').forEach((node) => {
    const value = WORDS[lang][node.dataset.tAriaLabel];
    if (typeof value === 'string') {
      node.setAttribute('aria-label', value);
      node.title = value;
    }
  });

  paintBatchLabels();
  el('storage').textContent = history.mode === 'server' ? t('storageServer') : t('storageDevice');
  paintCard();
  paintFigures();
  paintTally();   // the counter's caption is words too, so it has to be redrawn here
  paintSheet();
  paintLastArchive();
  setTheme(themeMode); // keep the theme button label in the active language
}

function effectiveTheme(mode) {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function updateThemeColorMeta() {
  if (typeof getComputedStyle !== 'function') return;
  const desk = getComputedStyle(document.documentElement).getPropertyValue('--desk').trim();
  if (!desk) return;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = desk;
}

function setTheme(mode) {
  if (mode !== 'light' && mode !== 'dark' && mode !== 'system') mode = 'system';
  themeMode = mode;
  const effective = effectiveTheme(mode);
  document.documentElement.dataset.theme = effective;
  document.documentElement.dataset.themeMode = mode;

  const glyphs = { system: '◐', light: '☀', dark: '☾' };
  el('theme-glyph').textContent = glyphs[mode];

  const title = t(`theme${mode[0].toUpperCase()}${mode.slice(1)}`);
  const btn = el('theme');
  btn.title = title;
  btn.setAttribute('aria-label', title);

  try { localStorage.setItem('theme', mode); } catch { /* blocked */ }
  updateThemeColorMeta();
}

function say(key) {
  el('notice-text').textContent = t(key);
  el('notice').hidden = false;
}
function hush() { el('notice').hidden = true; }

/**
 * Replaces the native confirm() dialog with an in-app modal. Returns a promise that
 * resolves to true if the person confirmed, false if they cancelled. The destructive
 * action is styled as secondary so a slip of the thumb does not erase anything.
 */
function askConfirm({ title, body, action, danger = false }) {
  return new Promise((resolve) => {
    const dialog = el('confirm');
    const titleEl = el('confirm-title');
    const bodyEl = el('confirm-body');
    const actionBtn = el('confirm-action');
    const cancelBtn = el('confirm-cancel');

    titleEl.textContent = title;
    bodyEl.textContent = body;
    actionBtn.textContent = action;
    actionBtn.className = danger ? 'btn btn--danger' : 'btn btn--primary';
    cancelBtn.textContent = t('cancel');

    const cleanup = () => {
      dialog.hidden = true;
      actionBtn.removeEventListener('click', onAction);
      cancelBtn.removeEventListener('click', onCancel);
    };
    const onAction = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    actionBtn.addEventListener('click', onAction);
    cancelBtn.addEventListener('click', onCancel);
    dialog.hidden = false;
  });
}

// ---------------------------------------------------------------------------
// The counter: the one element this desk is built around
// ---------------------------------------------------------------------------
function paintCount(value) {
  const text = groups(value);
  const box = el('odometer');
  el('odometer-text').textContent = `${text} — ${t('leftInQueue')}`;

  const shape = [...text].map((ch) => (/\d/.test(ch) ? 'd' : ch)).join('');
  if (box.dataset.shape !== shape) {
    // Digit count changed, so rebuild the reels. New nodes get their position before
    // they are in the document, which means no reel spins in from zero.
    box.dataset.shape = shape;
    [...box.querySelectorAll('.digit, .digit--sep')].forEach((node) => node.remove());
    for (const ch of text) {
      if (!/\d/.test(ch)) {
        const sep = document.createElement('span');
        sep.className = 'digit digit--sep';
        sep.textContent = ch;
        box.append(sep);
        continue;
      }
      const digit = document.createElement('span');
      digit.className = 'digit';
      const reel = document.createElement('span');
      reel.className = 'digit__reel';
      for (let n = 0; n <= 9; n += 1) {
        const face = document.createElement('span');
        face.textContent = String(n);
        reel.append(face);
      }
      reel.style.transform = `translateY(-${Number(ch)}em)`;
      digit.append(reel);
      box.append(digit);
    }
    return;
  }

  const reels = box.querySelectorAll('.digit:not(.digit--sep) .digit__reel');
  let index = 0;
  for (const ch of text) {
    if (!/\d/.test(ch)) continue;
    const reel = reels[index];
    index += 1;
    if (reel) reel.style.transform = `translateY(-${Number(ch)}em)`;
  }
}

function paintTally() {
  paintCount(queue.length);
  const done = oneWay.length - queue.length;
  const share = oneWay.length ? (queue.length / oneWay.length) * 100 : 0;
  el('spool').style.width = `${share}%`;
  el('fig-cleared').textContent = groups(done);
}

// ---------------------------------------------------------------------------
// The rail
// ---------------------------------------------------------------------------
function paintFigures() {
  if (!stats) return;
  el('fig-following').textContent = groups(stats.following);
  el('fig-followers').textContent = groups(stats.followers);
  el('fig-mutual').textContent = groups(stats.mutuals);
  el('fig-rate').textContent = `${stats.win_rate}%`;

  const oneWayCount = Math.max(stats.following - stats.mutuals, 0);
  const total = stats.mutuals + oneWayCount || 1;
  el('split-mutual').style.flexBasis = `${(stats.mutuals / total) * 100}%`;
  el('split-open').style.flexBasis = `${(oneWayCount / total) * 100}%`;
  el('split').hidden = false;

  el('skipped').hidden = skippedFiles.length === 0;
  el('skipped-count').textContent = groups(skippedFiles.length);
  const list = el('skipped-list');
  list.textContent = '';
  skippedFiles.forEach((name) => {
    const li = document.createElement('li');
    li.textContent = name;
    list.append(li);
  });
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------
function current() { return queue[0] || null; }

function paintCard() {
  const person = current();
  const card = el('card');
  const empty = el('card-empty');

  card.hidden = !person;
  empty.hidden = Boolean(person);
  el('act-batch').disabled = !person;
  paintHint();          // after card.hidden, because the note reads it

  // The stack behind the card is the work left, so show only as much as is real.
  document.querySelectorAll('.card--ghost').forEach((ghost) => {
    ghost.hidden = queue.length <= Number(ghost.dataset.depth);
  });

  if (!person) return;

  const named = Boolean(person.username);
  el('card-handle').textContent = named ? `@${person.username}` : person.account_id;
  el('card-id').textContent = person.account_id;
  card.querySelector('.card__eyebrow span').textContent = named ? t('cardEyebrow') : t('cardNoHandle');
}

/** Advances past the front card. `record` = the decision was persisted. */
function advance({ record }) {
  if (queue.length === 0) return;              // nothing to advance past; never re-queue undefined
  const [person, ...rest] = queue;
  queue = record ? rest : [...rest, person];   // a skip is not progress: it goes to the back
  paintTally();
  paintCard();
  paintSheet();
  const card = el('card');
  if (!card.hidden) {
    card.classList.remove('is-arriving');
    void card.offsetWidth;                     // restart the entry animation
    card.classList.add('is-arriving');
  }
}

/**
 * Opens a profile and records it.
 *
 * window.open must be called straight from the click, with no await before it: a
 * browser only honours it while the user's activation is still live. The previous
 * build wrapped these in setTimeout, which is why the batch button opened nothing.
 */
function openAndRecord(person) {
  const win = window.open(person.url, '_blank', 'noopener');
  if (!win) { say(NATIVE ? 'popupBlockedNative' : 'popupBlocked'); return false; }
  hush();
  record([person.account_id]);
  return true;
}

async function record(ids) {
  undoStack.push(ids);
  el('act-undo').disabled = false;
  const saved = await history.add(ids);
  if (!saved) say('historyOffline');
  paintTally();
}

function stampAndAdvance() {
  const card = el('card');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.classList.add('is-stamped');
  busyCard = true;

  const finish = () => {
    card.classList.remove('is-stamped', 'is-leaving');
    busyCard = false;
    stampTimers = [];
    advance({ record: true });
  };
  if (reduce) { stampTimers = [setTimeout(finish, 90)]; return; }
  stampTimers = [
    setTimeout(() => card.classList.add('is-leaving'), 380),
    setTimeout(finish, 700),
  ];
}

/**
 * Drop a stamp that is still in flight. Without this, loading a second archive while
 * a card animates out lets the old timer fire against the new queue and quietly
 * retire its first account — a skip nobody asked for and nobody would notice.
 */
function cancelStamp() {
  stampTimers.forEach(clearTimeout);
  stampTimers = [];
  busyCard = false;
  el('card').classList.remove('is-stamped', 'is-leaving');
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
function setView(next) {
  view = next;
  document.querySelectorAll('.view').forEach((tab) => {
    tab.classList.toggle('is-on', tab.dataset.view === next);
    tab.setAttribute('aria-pressed', String(tab.dataset.view === next));
  });
  const onQueue = next === 'queue';
  el('deck').hidden = !onQueue;
  el('undertray').hidden = !onQueue;
  // TOUCH, not NATIVE: a phone browser has no Enter to press either, and it was still being
  // shown a row of keys. The two rows are counterparts, so exactly one of them ever speaks.
  el('keys').hidden = !onQueue || TOUCH;
  el('sheet').hidden = onQueue;
  if (!onQueue) paintSheet();
  paintHint();          // after deck.hidden: the note goes with the deck when the view changes
}

function paintSheet() {
  if (view === 'queue' || !stats) return;
  const term = el('find').value.trim().toLowerCase();
  const pool = view === 'done'
    ? oneWay.filter((p) => history.has(p.account_id))
    : oneWay;
  const found = term
    ? pool.filter((p) => (p.username || '').toLowerCase().includes(term) || p.account_id.includes(term))
    : pool;

  el('sheet-count').textContent = t('sheetCount')(groups(found.length), groups(pool.length));

  const body = el('rows');
  body.textContent = '';
  const frag = document.createDocumentFragment();

  if (found.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'sheet__empty';
    td.textContent = term ? t('sheetNone') : (view === 'done' ? t('doneNone') : t('queueDone'));
    tr.append(td);
    frag.append(tr);
  }

  for (const person of found.slice(0, ROW_CAP)) {
    const done = history.has(person.account_id);
    const tr = document.createElement('tr');
    if (done) tr.className = 'is-done';

    const handle = document.createElement('td');
    handle.className = 'cell-handle';
    handle.textContent = person.username ? `@${person.username}` : `— ${t('noHandle')}`;

    const id = document.createElement('td');
    id.className = 'cell-id';
    id.textContent = person.account_id;

    const act = document.createElement('td');
    act.className = 'cell-act';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'row-btn';
    if (view === 'done') {
      button.textContent = t('rowUndo');
      button.addEventListener('click', () => putBack([person.account_id]));
    } else {
      button.textContent = t('rowOpen');
      button.addEventListener('click', () => {
        const win = window.open(person.url, '_blank', 'noopener');
        if (!win) { say(NATIVE ? 'popupBlockedNative' : 'popupBlocked'); return; }
        hush();
        if (!done) {
          record([person.account_id]);
          queue = queue.filter((p) => p.account_id !== person.account_id);
          paintTally();
          paintCard();
        }
        paintSheet();
      });
    }
    act.append(button);

    tr.append(handle, id, act);
    frag.append(tr);
  }
  body.append(frag);

  const hidden = Math.max(found.length - ROW_CAP, 0);
  el('sheet-more').hidden = hidden === 0;
  if (hidden) el('sheet-more').textContent = t('sheetMore')(groups(hidden));
}

// ---------------------------------------------------------------------------
// Undo — a desk without one punishes a slip of the finger
// ---------------------------------------------------------------------------
async function putBack(ids) {
  const set = new Set(ids);
  const returning = oneWay.filter((p) => set.has(p.account_id) && !queue.some((q) => q.account_id === p.account_id));
  queue = [...returning, ...queue];
  const saved = await history.remove(ids);
  if (!saved) say('historyOffline');
  paintTally();
  paintCard();
  paintSheet();
}

async function undoLast() {
  const last = undoStack.pop();
  el('act-undo').disabled = undoStack.length === 0;
  if (!last) return;
  await putBack(last);
  if (view !== 'queue') setView('queue');
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------
function batchSize() {
  // Reading localStorage throws outright when a browser is set to block all site
  // data, so this is guarded like every other access to it.
  let stored = NaN;
  try { stored = parseInt(localStorage.getItem('x_batch_size'), 10); } catch { /* blocked */ }
  const allowed = [5, 10, 20, 50];
  const value = allowed.includes(stored) ? stored : 10;
  el('batch-size').value = String(value);
  return value;
}

/**
 * Both batch buttons say how many tabs they will open, so both have to be redrawn
 * whenever that number or the language changes. One function rather than two call sites:
 * the phone shows the in-card button and the desktop shows the undertray one, so a
 * missed repaint is invisible on the machine you are testing and wrong on the other.
 */
function paintBatchLabels() {
  const count = batchSize();
  el('batch-label').textContent = t('batchOpen')(count);
  const native = el('batch-native-label');
  if (native) native.textContent = t('batchOpenNative')(count);
}

function openBatch() {
  const batch = queue.slice(0, batchSize());
  if (!batch.length) return;

  const opened = [];
  let blocked = false;
  for (const person of batch) {
    const win = window.open(person.url, '_blank', 'noopener');
    if (win) opened.push(person.account_id);
    else { blocked = true; break; }   // once the blocker trips, the rest will fail too
  }

  if (blocked) say(NATIVE ? 'popupBlockedNative' : 'popupBlocked'); else hush();
  if (!opened.length) return;

  const done = new Set(opened);
  queue = queue.filter((p) => !done.has(p.account_id));
  record(opened);
  paintTally();
  paintCard();
  paintSheet();
}

// ---------------------------------------------------------------------------
// Reading an archive
// ---------------------------------------------------------------------------
function isWelcomeDismissed() {
  if (welcomeDismissed) return true;
  try { return localStorage.getItem('welcomeDismissed') === 'true'; } catch { return false; }
}

function isSwipeLearned() {
  if (swipeLearned) return true;
  try { return localStorage.getItem('swipeLearned') === 'true'; } catch { return false; }
}

/** One successful brush is the whole lesson, so the note comes down and stays down. */
function learnSwipe() {
  if (swipeLearned) return;
  swipeLearned = true;
  // Deliberately not cleared by "forget everything": that erases decisions and re-runs the
  // capability probe, but nobody unlearns a gesture by clearing their history.
  try { localStorage.setItem('swipeLearned', 'true'); } catch { /* blocked */ }
  paintHint();
}

/**
 * Derived, never told. The note is only true when a live card is actually on the desk, so it
 * reads that from the card and the deck instead of trusting each caller to remember — the same
 * mistake as the per-element `[hidden]` guards, where three call sites existed and six were
 * forgotten.
 */
function paintHint() {
  const hint = el('hint');
  if (!hint) return;
  hint.hidden = !TOUCH || isSwipeLearned() || el('card').hidden || el('deck').hidden;
}

function dismissWelcome() {
  welcomeDismissed = true;
  try { localStorage.setItem('welcomeDismissed', 'true'); } catch { /* blocked */ }
  paintWelcome();
}

function probeBrowser() {
  const state = { popups: true, storage: true };
  if (!NATIVE) {
    const win = window.open('', '_blank');
    state.popups = Boolean(win);
    if (win && typeof win.close === 'function') win.close();
  }
  try {
    const key = 'x_probe_' + Date.now();
    localStorage.setItem(key, '1');
    localStorage.removeItem(key);
  } catch {
    state.storage = false;
  }
  return state;
}

function welcomeMessage(state) {
  if (NATIVE) return t('welcomeNativeReady');
  const parts = [];
  if (!state.popups) parts.push(t('welcomePopupsBlocked'));
  if (!state.storage) parts.push(t('welcomeStorageBlocked'));
  if (parts.length === 0) return t('welcomeReady');
  return parts.join(' ');
}

function paintWelcome() {
  const welcome = el('welcome');
  const body = el('welcome-body');
  if (!welcome || !body) return;
  const show = !(welcomeDismissed || isWelcomeDismissed()) && !el('intro').hidden;
  welcome.hidden = !show;
  if (show) body.textContent = welcomeMessage(probeBrowser());
}

function showStage(which) {
  el('intro').hidden = which !== 'intro';
  el('busy').hidden = which !== 'busy';
  const working = which === 'work';
  el('tally').hidden = !working;
  el('views').hidden = !working;
  if (working) setView('queue');
  else { el('deck').hidden = true; el('undertray').hidden = true; el('keys').hidden = true; el('sheet').hidden = true; }
  paintHint();
  paintWelcome();
}

/**
 * Old browsers without DecompressionStream cannot inflate in the page. When the
 * Python server is the one serving us, hand the file to it rather than failing.
 */
async function readArchive(file, { onProgress } = {}) {
  if (typeof DecompressionStream === 'function') return analyzeArchive(file, { onProgress });
  // Older browsers without DecompressionStream fall back to the Python server;
  // progress cannot be streamed from that endpoint.
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/analyze', { method: 'POST', body: form });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || 'errUnknown');
  }
  return response.json();
}

function failureKey(error) {
  if (error instanceof ZipError) {
    return { notZip: 'errNotZip', empty: 'errEmpty', damaged: 'errDamaged',
             unsupported: 'errUnsupported', tooLarge: 'errTooLarge' }[error.code] || 'errUnknown';
  }
  if (error && error.message === 'noFollowData') return 'errNoFollowData';
  return 'errUnknown';
}

function formatTimeAgo(ms) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 10) return t('justNow');
  const minutes = Math.round(seconds / 60);
  if (minutes < 2) {
    const unit = t('timeUnit')[seconds === 1 ? 'second' : 'seconds'];
    return t('timeAgo')(seconds, unit);
  }
  const hours = Math.round(minutes / 60);
  if (hours < 2) {
    const unit = t('timeUnit')[minutes === 1 ? 'minute' : 'minutes'];
    return t('timeAgo')(minutes, unit);
  }
  const days = Math.round(hours / 24);
  if (days < 2) {
    const unit = t('timeUnit')[hours === 1 ? 'hour' : 'hours'];
    return t('timeAgo')(hours, unit);
  }
  const unit = t('timeUnit')[days === 1 ? 'day' : 'days'];
  return t('timeAgo')(days, unit);
}

function readLastArchive() {
  try {
    const raw = localStorage.getItem('x_last_archive');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeLastArchive(file) {
  if (!file) return;
  const record = { name: file.name, size: file.size, lastModified: file.lastModified, readAt: Date.now() };
  try { localStorage.setItem('x_last_archive', JSON.stringify(record)); } catch { /* blocked */ }
}

function clearLastArchive() {
  try { localStorage.removeItem('x_last_archive'); } catch { /* blocked */ }
}

function paintLastArchive() {
  const node = el('last-archive');
  if (!node) return;
  const record = readLastArchive();
  if (!record) {
    node.textContent = `${t('lastArchive')}: ${t('lastArchiveNone')}`;
    return;
  }
  const ago = formatTimeAgo(Date.now() - record.readAt);
  node.textContent = `${t('lastArchive')}: ${record.name} — ${ago}`;
}

function setReadProgress(fraction) {
  const busySpool = el('busy-spool');
  if (busySpool) busySpool.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
}

async function loadArchive(file) {
  if (!file) return;
  hush();
  cancelStamp();
  showStage('busy');
  setReadProgress(0);

  let result;
  try {
    result = await readArchive(file, {
      onProgress: ({ fraction }) => setReadProgress(fraction),
    });
  } catch (error) {
    setReadProgress(0);
    showStage('intro');
    paintLastArchive();
    say(failureKey(error));
    return;
  }

  writeLastArchive(file);
  stats = result.stats;
  skippedFiles = result.ignored_files || [];
  oneWay = result.not_following;
  // Pick up anything reviewed elsewhere (the desktop app writes the same file) before
  // deciding what belongs in the queue.
  await history.refresh();
  queue = oneWay.filter((person) => !history.has(person.account_id));
  undoStack = [];
  el('act-undo').disabled = true;

  const who = el('whoami');
  who.hidden = !result.account_username;
  who.textContent = result.account_username ? `@${result.account_username}` : '';

  showStage('work');
  paintFigures();
  paintTally();
  paintCard();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
el('file').addEventListener('change', (event) => loadArchive(event.target.files[0]));
el('file2').addEventListener('change', (event) => loadArchive(event.target.files[0]));

// Android's document picker filters by MIME type, and Downloads / Drive / Telegram
// frequently report a ZIP as application/octet-stream or application/x-zip-compressed.
// In the Capacitor build we remove the accept attribute so the archive is selectable;
// the browser keeps it because providers there report real MIME types. Content validation
// in web/zip.js still rejects a non-ZIP with a clear message.
if (NATIVE) {
  for (const id of ['file', 'file2']) {
    const input = el(id);
    if (input) input.removeAttribute('accept');
  }
  // The in-card batch button ships hidden so it never flashes before this runs. Clearing
  // the attribute here rather than leaning on the CSS rule keeps one mechanism in charge:
  // a `display` declaration does override [hidden], but only until someone reorders the
  // stylesheet, and assistive technology should not have to guess which one won.
  el('act-batch-native')?.removeAttribute('hidden');
}

const zone = el('dropzone');
['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => {
  event.preventDefault();
  zone.classList.add('is-hovered');
}));
['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, () => zone.classList.remove('is-hovered')));
zone.addEventListener('drop', (event) => {
  event.preventDefault();
  loadArchive(event.dataTransfer.files[0]);
});

el('lang').addEventListener('click', () => {
  lang = lang === 'fa' ? 'en' : 'fa';
  try { localStorage.setItem('lang', lang); } catch { /* blocked */ }
  paintWords();
});

el('theme').addEventListener('click', () => {
  const next = { system: 'light', light: 'dark', dark: 'system' };
  setTheme(next[themeMode] || 'light');
});

const darkMedia = matchMedia('(prefers-color-scheme: dark)');
if (darkMedia && typeof darkMedia.addEventListener === 'function') {
  darkMedia.addEventListener('change', () => {
    if (themeMode === 'system') setTheme('system');
  });
}

el('act-open').addEventListener('click', () => {
  const person = current();
  if (!person || busyCard) return;
  if (openAndRecord(person)) stampAndAdvance();
});
el('act-skip').addEventListener('click', () => { if (!busyCard) advance({ record: false }); });
el('act-batch').addEventListener('click', openBatch);
el('act-batch-native')?.addEventListener('click', openBatch);
el('act-undo').addEventListener('click', undoLast);
el('empty-see').addEventListener('click', () => setView('done'));

/**
 * Brushing the card aside defers it — the phone's version of Space.
 *
 * Both directions do the same thing on purpose. The other half of the pair, open-and-record,
 * leaves the app and retires the account for good, so it stays a deliberate tap: a gesture
 * you can make by accident must never be the destructive one. Deferring costs nothing, which
 * is exactly why it is the one worth making fast.
 *
 * Pointer events only, and only for touch and pen: a mouse already has two buttons in front
 * of it, and dragging paper with a cursor is a different idiom.
 */
(() => {
  const card = el('card');
  if (!card || typeof card.setPointerCapture !== 'function') return;   // no pointer events here

  let startX = 0, startY = 0, dx = 0, id = null, dragging = false;

  // Far enough that it cannot be a tap that wandered, and short enough to flick.
  // Proportional to the card so it means the same thing on a small phone and a tablet.
  const commitDistance = () => Math.max(56, card.offsetWidth * 0.28);

  const settle = (toX) => {
    card.classList.remove('is-dragging');
    card.classList.add('is-settling');
    card.style.transform = toX ? `translateX(${toX}px) rotate(${toX / 60}deg)` : '';
    card.style.opacity = toX ? '0' : '';
  };

  const clear = () => {
    card.classList.remove('is-dragging', 'is-settling');
    card.style.transform = '';
    card.style.opacity = '';
  };

  card.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || busyCard || !current()) return;
    // A drag that starts on a button is that button's press, not the card's.
    if (event.target && event.target.closest && event.target.closest('button')) return;
    id = event.pointerId;
    startX = event.clientX; startY = event.clientY; dx = 0; dragging = false;
    clear();
  });

  card.addEventListener('pointermove', (event) => {
    if (id === null || event.pointerId !== id) return;
    const moveX = event.clientX - startX;
    const moveY = event.clientY - startY;
    if (!dragging) {
      // Until the direction is settled, let the browser have it. Claiming the pointer on the
      // first pixel would fight the page's own scrolling on every vertical flick.
      if (Math.abs(moveX) < 10 || Math.abs(moveX) <= Math.abs(moveY)) return;
      dragging = true;
      card.classList.add('is-dragging');
      card.classList.remove('is-settling');
      // Without capture the card stops hearing the finger the moment it leaves its edge, and
      // a card mid-flick freezes halfway across the screen.
      try { card.setPointerCapture(id); } catch { /* pointer already gone */ }
    }
    dx = moveX;
    // The paper turns as it slides, so it reads as a sheet being pushed rather than a box
    // sliding on rails. Divided, not multiplied: a few degrees across the whole travel.
    card.style.transform = `translateX(${dx}px) rotate(${dx / 60}deg)`;
    card.style.opacity = String(Math.max(0.35, 1 - Math.abs(dx) / (card.offsetWidth * 1.6)));
  });

  const end = (event) => {
    if (id === null || (event && event.pointerId !== id)) return;
    const pointer = id;
    id = null;
    try { card.releasePointerCapture(pointer); } catch { /* never captured */ }
    if (!dragging) { clear(); return; }
    dragging = false;

    if (Math.abs(dx) >= commitDistance() && !busyCard) {
      // Send it the way it was already going, then let the queue move under it. The card is
      // reused for the next account, so the styles have to come off once it has landed.
      settle(dx > 0 ? card.offsetWidth * 1.2 : card.offsetWidth * -1.2);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const done = () => { clear(); advance({ record: false }); learnSwipe(); };
      if (reduce) done(); else setTimeout(done, 200);
    } else {
      settle(0);   // not far enough to mean anything: back to where it was
      setTimeout(() => card.classList.remove('is-settling'), 240);
    }
    dx = 0;
  };

  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
})();

el('batch-size').addEventListener('change', () => {
  try { localStorage.setItem('x_batch_size', el('batch-size').value); } catch { /* blocked */ }
  paintBatchLabels();
});

document.querySelectorAll('.view').forEach((tab) => {
  tab.addEventListener('click', () => setView(tab.dataset.view));
});
el('find').addEventListener('input', paintSheet);
el('notice-x').addEventListener('click', hush);

el('welcome-dismiss')?.addEventListener('click', dismissWelcome);
el('welcome-check')?.addEventListener('click', paintWelcome);
el('welcome-help')?.addEventListener('click', () => {
  welcomeDismissed = false;
  try { localStorage.removeItem('welcomeDismissed'); } catch { /* blocked */ }
  paintWelcome();
});

el('forget').addEventListener('click', async () => {
  // forgetAll, not forget. The key was renamed to match the data-t attribute in the
  // markup and these two call sites were missed, so the dialog opened with the string
  // "undefined" as both its title and its confirm button for as long as it has existed.
  // Section [2] of tests/test_frontend.mjs now reads the t('...') calls out of this file
  // as well as the data-t attributes, which is the only reason a JS-only key gets checked.
  const confirmed = await askConfirm({
    title: t('forgetAll'),
    body: t('confirmForget'),
    action: t('forgetAll'),
    danger: true,
  });
  if (!confirmed) return;
  const saved = await history.clear();
  if (!saved) { say('historyOffline'); return; }
  cancelStamp();          // a stamp still in flight would advance past the refilled queue
  queue = [...oneWay];
  undoStack = [];
  el('act-undo').disabled = true;
  welcomeDismissed = false;
  clearLastArchive();
  try { localStorage.removeItem('welcomeDismissed'); } catch { /* blocked */ }
  hush();
  paintTally();
  paintCard();
  paintSheet();
  paintLastArchive();   // the intro card names the last archive; erasing has to unname it
  paintWelcome();
});

// Shortcuts. Kept off any element the person might be typing into.
// The same keys as the desktop app, deliberately: it is one program in two windows, and
// a shortcut that works in one shell and not the other is worse than none at all.
const VIEW_KEYS = { 1: 'queue', 2: 'all', 3: 'done' };

document.addEventListener('keydown', (event) => {
  const tag = event.target.tagName;

  if (event.key === 'Escape' && el('welcome') && !el('welcome').hidden) {
    event.preventDefault();
    dismissWelcome();
    return;
  }

  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || event.metaKey || event.ctrlKey || event.altKey) return;

  // Handled above the guard below, because switching views has to work *from* the other
  // views — that is the whole point of having a key for it. Only once an archive is
  // loaded: the tabs are hidden before that, and jumping to an empty sheet is no help.
  const jump = VIEW_KEYS[event.key];
  if (jump) {
    if (stats) { event.preventDefault(); setView(jump); }
    return;
  }

  if (view !== 'queue' && event.key !== 'u' && event.key !== 'U') return;

  const person = current();
  switch (event.key) {
    case 'Enter':
    case 'o':
    case 'O':
      if (person && !busyCard) { event.preventDefault(); if (openAndRecord(person)) stampAndAdvance(); }
      break;
    case ' ':
    case 's':
    case 'S':
      if (person && !busyCard) { event.preventDefault(); advance({ record: false }); }
      break;
    case 'b':
    case 'B':
      if (person) { event.preventDefault(); openBatch(); }
      break;
    case 'u':
    case 'U':
      event.preventDefault();
      undoLast();
      break;
    default:
      break;
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
setTheme(themeMode);
await history.open();
batchSize();
paintWords();
showStage('intro');
