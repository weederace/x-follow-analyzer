/**
 * history.js — where "I already dealt with this account" is remembered.
 *
 * Two homes, picked automatically:
 *
 *   server  the Python app is running, so history is a file in your OS user-data
 *           folder. Outside the project directory on purpose: this repo gets cloned
 *           and re-shared by strangers, and a file inside it is one `git add -f` away
 *           from publishing which accounts a person follows. It also means the
 *           desktop app and the browser share one history.
 *   device  no server answered — the Android build, or the page opened on its own.
 *           Falls back to this device's own storage.
 *
 * The old build only ever used localStorage, which is why reviewed accounts kept
 * coming back: a private window, a "clear data on exit" setting, or simply switching
 * between localhost:8000 and 127.0.0.1:8000 (separate origins, separate storage)
 * silently emptied it.
 */

const KEY = 'x_triage_history';
const LEGACY_KEY = 'x_processed_ids';   // written by the pre-rewrite build
const API = '/api/history';

/** Same validation the Python side applies, so both stores hold the same shape. */
function clean(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(ids) ? ids : []) {
    const value = typeof raw === 'number' ? String(Math.trunc(raw)) : raw;
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id || id.length > 32 || !/^\d+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readLocal() {
  for (const key of [KEY, LEGACY_KEY]) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      if (Array.isArray(stored) && stored.length) return clean(stored);
    } catch { /* unreadable or disabled storage: treat as empty */ }
  }
  return [];
}

function writeLocal(ids) {
  const cleaned = clean(ids);
  try { localStorage.setItem(KEY, JSON.stringify(cleaned)); } catch { /* full or blocked */ }
  return cleaned;
}

async function callApi(method, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(API, options);
  if (!response.ok) throw new Error(`history ${method} failed: ${response.status}`);
  const data = await response.json();
  return clean(data.processed);
}

export function createHistory() {
  let mode = 'unknown';        // 'server' | 'device'
  let ids = new Set();
  let degraded = false;        // server was there, then stopped answering

  /** True once, after the first load, if the server took over. */
  const onServer = () => mode === 'server';

  async function open() {
    try {
      const fromServer = await callApi('GET');
      mode = 'server';
      // Carry across anything the old localStorage build had left behind.
      const local = readLocal();
      const unknown = local.filter((id) => !fromServer.includes(id));
      ids = new Set(unknown.length ? await callApi('POST', { ids: unknown }) : fromServer);
    } catch {
      mode = 'device';
      ids = new Set(readLocal());
    }
    return list();
  }

  function list() { return [...ids]; }
  function has(id) { return ids.has(id); }
  function size() { return ids.size; }

  /**
   * Re-read the store without redoing the migration. The history file is shared with
   * the desktop app, so anything reviewed there while this page sat open would
   * otherwise reappear in the queue as if it were new.
   */
  async function refresh() {
    if (!onServer()) { ids = new Set(readLocal()); return list(); }
    try {
      ids = new Set(await callApi('GET'));
      degraded = false;
    } catch {
      degraded = true;   // keep what we have; the queue is better stale than reset
    }
    return list();
  }

  /**
   * Record decisions. The screen has already moved on by the time this resolves, so
   * it returns whether the write stuck — the caller warns instead of pretending.
   */
  async function add(newIds) {
    const cleaned = clean(newIds);
    if (!cleaned.length) return true;
    cleaned.forEach((id) => ids.add(id));
    if (!onServer()) { writeLocal(list()); return true; }
    try {
      ids = new Set(await callApi('POST', { ids: cleaned }));
      degraded = false;
      return true;
    } catch {
      degraded = true;
      return false;
    }
  }

  async function remove(dropIds) {
    const cleaned = clean(dropIds);
    if (!cleaned.length) return true;
    cleaned.forEach((id) => ids.delete(id));
    if (!onServer()) { writeLocal(list()); return true; }
    try {
      ids = new Set(await callApi('DELETE', { ids: cleaned }));
      degraded = false;
      return true;
    } catch {
      degraded = true;
      return false;
    }
  }

  async function clear() {
    ids = new Set();
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    if (!onServer()) { writeLocal([]); return true; }
    try {
      ids = new Set(await callApi('DELETE'));
      degraded = false;
      return true;
    } catch {
      degraded = true;
      return false;
    }
  }

  return {
    open, refresh, list, has, size, add, remove, clear,
    get mode() { return mode; },
    get degraded() { return degraded; },
  };
}
