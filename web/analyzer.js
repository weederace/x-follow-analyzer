/**
 * analyzer.js — reads an X data archive in the browser and works out who does not
 * follow you back. A direct port of archive_parser.py; the two are kept in step by a
 * test that runs both over the same fixture archive and diffs the results.
 *
 * Running this client-side is what lets the same code work on a phone with no Python
 * and no server, and it means the archive never leaves the device.
 */

import { openZip } from './zip.js';

// Optional part suffix: follower-part1.js, following_part2.json, ...
const PART = '(?:[-_]part\\d+)?';
const FOLLOWER_RE = new RegExp(`^followers?${PART}\\.(?:js|json)$`, 'i');
const FOLLOWING_RE = new RegExp(`^following${PART}\\.(?:js|json)$`, 'i');
const PROFILE_RE = /^(?:account|profile)\.(?:js|json)$/i;

/**
 * Decide what an archive entry is, by exact basename.
 *
 * The bug this replaces: the old code asked whether the path *contained* "follower",
 * which also matched follower-requests-sent.js. Accounts you had merely requested to
 * follow were counted as real followers, so they looked mutual and dropped out of the
 * results entirely. An allowlist cannot make that mistake, and if X renames these
 * files we surface "no follower data found" instead of a confidently wrong answer.
 */
export function classify(path) {
  const name = path.replace(/\\/g, '/').split('/').pop();
  if (FOLLOWING_RE.test(name)) return 'following';
  if (FOLLOWER_RE.test(name)) return 'follower';
  if (PROFILE_RE.test(name)) return 'profile';
  return null;
}

const NON_HANDLE_SEGMENTS = new Set(['i', 'home', 'intent', 'search']);

// An X handle is word characters only. Validating instead of trusting whatever sat in
// the link keeps us from building a profile URL out of junk — and it is what keeps this
// function byte-identical to its Python twin, which does not percent-encode odd paths
// the way URL does. Real handles cap at 15; 20 leaves room for legacy oddities.
const HANDLE_RE = /^[A-Za-z0-9_]{1,20}$/;

/**
 * Pull the first path segment out of a profile link.
 *
 * Deliberately hand-rolled rather than using URL: the two platforms disagree. URL
 * normalises "x.com/../../etc/passwd" to "/etc/passwd" and hands back "etc", Python's
 * urlparse does not, and URL percent-encodes paths containing spaces while urlparse
 * leaves them alone. Since this function has a Python twin, the rule has to be
 * explicit in both places rather than inherited from a parser.
 */
function handleFromLink(link) {
  if (typeof link !== 'string' || !link) return '';

  let rest = link;
  const schemeAt = rest.indexOf('://');
  if (schemeAt !== -1) {
    const authority = rest.slice(schemeAt + 3);
    const slashAt = authority.indexOf('/');
    rest = slashAt !== -1 ? authority.slice(slashAt) : '';
  }
  for (const separator of ['?', '#']) {
    const cut = rest.indexOf(separator);
    if (cut !== -1) rest = rest.slice(0, cut);
  }

  const segments = rest.split('/').filter(Boolean);
  if (segments.length === 0) return '';

  const first = segments[0].replace(/^@+/, '');
  if (NON_HANDLE_SEGMENTS.has(first.toLowerCase())) return '';
  return HANDLE_RE.test(first) ? first : '';
}

/**
 * Best-effort handle. Usually returns '' for a real archive: X only ships an
 * accountId and a twitter.com/intent/user?user_id=… link, whose first path segment is
 * "intent". Callers fall back to an /i/user/<id> link, which resolves fine.
 */
export function extractUsername(obj) {
  if (!obj || typeof obj !== 'object') return '';

  const handle = handleFromLink(obj.userLink || obj.profileLink || obj.url);
  if (handle) return handle;

  for (const key of ['screenName', 'username', 'userName']) {
    const value = obj[key];
    if (typeof value === 'string' && value) {
      const candidate = value.replace(/^@/, '');
      if (HANDLE_RE.test(candidate)) return candidate;
    }
  }
  return '';
}

/** Pull the JSON array out of a `window.YTD.x.part0 = [...]` assignment. */
function payload(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let body = text.slice(start).trim();
  if (body.endsWith(';')) body = body.slice(0, -1).trim();
  try { return JSON.parse(body); } catch { return null; }
}

function accountId(obj) {
  const aid = obj.accountId || obj.id;
  return aid ? String(aid) : '';
}

function readHandle(data) {
  if (!Array.isArray(data) || !data[0] || typeof data[0] !== 'object') return '';
  for (const [wrapper, key] of [['account', 'username'], ['profile', 'screenName']]) {
    const section = data[0][wrapper];
    if (section && typeof section === 'object' && typeof section[key] === 'string' && section[key]) {
      return section[key];
    }
  }
  return '';
}

/**
 * Read the archive. Only the handful of files we recognise are decompressed, so a
 * media-heavy multi-gigabyte export costs no more than a small one.
 * @param {Blob} blob
 */
export async function parseArchive(blob) {
  const zip = await openZip(blob);
  const followers = new Map();
  const following = new Map();
  const ignored = [];
  let mainUsername = '';

  const decoder = new TextDecoder('utf-8');
  const wanted = [];
  for (const entry of zip.entries) {
    if (entry.name.endsWith('/')) continue;
    const kind = classify(entry.name);
    if (kind) { wanted.push({ entry, kind }); continue; }
    const lower = entry.name.toLowerCase();
    if (lower.includes('follow') && (lower.endsWith('.js') || lower.endsWith('.json'))) {
      ignored.push(entry.name);
    }
  }

  for (const { entry, kind } of wanted) {
    let text;
    try {
      text = decoder.decode(await zip.read(entry));
    } catch { continue; }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);  // strip the BOM

    const data = payload(text);
    if (!Array.isArray(data)) continue;

    if (kind === 'profile') {
      if (!mainUsername) mainUsername = readHandle(data);
      continue;
    }

    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      // Trust the item's own wrapper key over the filename when present.
      let bucket, obj;
      if (item.follower && typeof item.follower === 'object') { bucket = followers; obj = item.follower; }
      else if (item.following && typeof item.following === 'object') { bucket = following; obj = item.following; }
      else { bucket = kind === 'follower' ? followers : following; obj = item; }

      const aid = accountId(obj);
      if (aid) bucket.set(aid, extractUsername(obj));
    }
  }

  return { followers, following, mainUsername, ignored };
}

/** Compare the two sets. Mirrors analyze() in archive_parser.py, including the sort. */
export function analyze({ followers, following, mainUsername = '', ignored = [] }) {
  const notFollowing = [];
  for (const [aid, handle] of following) {
    if (followers.has(aid)) continue;
    notFollowing.push({
      account_id: aid,
      username: handle,
      url: handle ? `https://x.com/${handle}` : `https://x.com/i/user/${aid}`,
    });
  }

  // Named accounts first (blank handles are the common case and carry no ordering
  // information), then alphabetical, then by ID so the order is stable between runs.
  notFollowing.sort((a, b) => {
    const aBlank = a.username === '' ? 1 : 0;
    const bBlank = b.username === '' ? 1 : 0;
    if (aBlank !== bBlank) return aBlank - bBlank;
    const byName = a.username.toLowerCase().localeCompare(b.username.toLowerCase(), 'en');
    if (byName !== 0) return byName;
    return a.account_id < b.account_id ? -1 : a.account_id > b.account_id ? 1 : 0;
  });

  let mutuals = 0;
  for (const aid of following.keys()) if (followers.has(aid)) mutuals += 1;

  const totalFollowing = following.size;
  const round = (value, places) => Number(value.toFixed(places));

  return {
    account_username: mainUsername,
    stats: {
      followers: followers.size,
      following: totalFollowing,
      remaining: notFollowing.length,
      mutuals,
      win_rate: totalFollowing ? round((mutuals / totalFollowing) * 100, 1) : 0,
      ratio: totalFollowing ? round(followers.size / totalFollowing, 2) : 0,
    },
    not_following: notFollowing,
    ignored_files: ignored,
  };
}

/**
 * Read a file and return the full analysis payload.
 * Throws with a message meant to be shown to the person, not logged.
 */
export async function analyzeArchive(blob) {
  const parsed = await parseArchive(blob);
  if (parsed.followers.size === 0 && parsed.following.size === 0) {
    throw new Error('noFollowData');
  }
  return analyze(parsed);
}
