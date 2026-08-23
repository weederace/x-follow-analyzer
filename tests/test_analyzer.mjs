/**
 * Verifies the client-side reader, and — more importantly — that it agrees exactly
 * with the Python parser. Two implementations of one algorithm drift silently; this
 * runs both over the same archive and diffs the payloads.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

// Located from this file, so the suite runs from a clone anywhere. Two spellings on
// purpose: modules must be imported as file: URLs (a bare "D:\..." is not a valid
// specifier on Windows), and the path handed to Python gets forward slashes because a
// backslash inside a generated string literal is an escape waiting to bite.
const PROJECT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '').replace(/\\/g, '/');
const mod = (name) => new URL(`../web/${name}`, import.meta.url).href;
const { analyzeArchive, classify, extractUsername } = await import(mod('analyzer.js'));
const { openZip, ZipError } = await import(mod('zip.js'));

// `python3` does not exist on a default Windows install, where the launcher is `py`
// and the executable is `python`. Try them in order rather than failing with
// "command not found" on the one platform most people run this on.
const PYTHON = ['python3', 'python', 'py'].find((exe) => {
  try {
    execFileSync(exe, ['-c', 'print(1)'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
});
const py = (source) => execFileSync(PYTHON, ['-c', source], { encoding: 'utf8' });

// The fixture is built by tests/fixture.py, the same code the Python suite uses, so the
// two readers are compared on identical bytes. Building it here rather than expecting
// test_parser.py to have left it in /tmp means either suite can run alone, on any OS.
const SCRATCH = mkdtempSync(join(tmpdir(), 'xfa-js-'));
const FIXTURE = join(SCRATCH, 'fixture_archive.zip');
const FIXTURE_PY = FIXTURE.replace(/\\/g, '/');
if (PYTHON) execFileSync(PYTHON, [`${PROJECT}/tests/fixture.py`, FIXTURE]);

let ok = 0, fail = 0, skipped = 0;
let jsResult = null;
const check = (label, cond) => {
  if (cond) { ok++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

// ---------------------------------------------------------------------------
// A hand-built ZIP writer, so the tests can control compression method exactly.
// ---------------------------------------------------------------------------
function buildZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = -1;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  for (const { name, data, store = false } of files) {
    const nameBytes = enc.encode(name);
    const raw = typeof data === 'string' ? enc.encode(data) : data;
    const body = store ? raw : new Uint8Array(deflateRawSync(raw));
    const method = store ? 0 : 8;
    const crc = crc32(raw);

    const local = new Uint8Array(30 + nameBytes.length + body.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(8, method, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, body.length, true);
    ldv.setUint32(22, raw.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(body, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(central.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(10, method, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, body.length, true);
    cdv.setUint32(24, raw.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, cdSize, true);
  edv.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, eocd]);
}

const ytd = (kind, rows) => '﻿' + `window.YTD.${kind}.part0 = ` + JSON.stringify(rows);
const entry = (wrapper, aid) => ({
  [wrapper]: { accountId: aid, userLink: `https://twitter.com/intent/user?user_id=${aid}` },
});

// Parity is the reason this file exists, so a missing Python is called out loudly
// rather than quietly reducing the suite to the JavaScript half.
if (!PYTHON) {
  console.log('\n[1,2] SKIPPED — no python3/python/py on PATH, so the two readers');
  console.log('      cannot be compared. Install Python and run this again.');
  skipped += 2;
} else {

console.log('\n[1] Reads a real archive built by Python (deflate, BOM, YTD wrapper)');
const fixture = new Blob([readFileSync(FIXTURE)]);
jsResult = await analyzeArchive(fixture);
check('followers counted', jsResult.stats.followers === 3);
check('following counted', jsResult.stats.following === 5);
check('the account hidden by the old bug is present',
      jsResult.not_following.some(r => r.account_id === '202'));
check('no ids leaked from follower-requests-sent.js',
      !jsResult.not_following.some(r => ['999', '888', '777', '666', '555'].includes(r.account_id)));
check('handle read from account.js', jsResult.account_username === 'ashka');

console.log('\n[2] JS and Python agree exactly on the same archive');
const pyJson = py(`
import sys, json
sys.path.insert(0, "${PROJECT}")
import archive_parser
print(json.dumps(archive_parser.analyze_archive(open("${FIXTURE_PY}","rb").read())))
`);
const pyResult = JSON.parse(pyJson);
const norm = (r) => JSON.stringify({ ...r, ignored_files: [...r.ignored_files].sort() });
check('stats identical', JSON.stringify(pyResult.stats) === JSON.stringify(jsResult.stats));
check('not_following list identical, same order',
      JSON.stringify(pyResult.not_following) === JSON.stringify(jsResult.not_following));
check('ignored files identical', norm(pyResult) === norm(jsResult));
if (norm(pyResult) !== norm(jsResult)) {
  console.log('    python:', JSON.stringify(pyResult).slice(0, 300));
  console.log('    js    :', JSON.stringify(jsResult).slice(0, 300));
}

}

console.log('\n[3] Uncompressed (stored) entries');
const stored = buildZip([
  { name: 'data/following.js', data: ytd('following', [entry('following', '1'), entry('following', '2')]), store: true },
  { name: 'data/follower.js', data: ytd('follower', [entry('follower', '1')]), store: true },
]);
const storedResult = await analyzeArchive(stored);
check('stored entries decoded', storedResult.stats.following === 2);
check('difference still correct', storedResult.not_following.map(r => r.account_id).join() === '2');

console.log('\n[4] Part files and mixed compression');
const parts = buildZip([
  { name: 'data/following.js', data: ytd('following', [entry('following', '1')]) },
  { name: 'data/following-part1.js', data: ytd('following', [entry('following', '2')]), store: true },
  { name: 'data/following_part2.json', data: ytd('following', [entry('following', '3')]) },
  { name: 'data/follower.js', data: ytd('follower', []) },
  { name: 'data/follower-requests-sent.js', data: ytd('x', [entry('follower', '2')]) },
]);
const partsResult = await analyzeArchive(parts);
check('three part files merged', partsResult.stats.following === 3);
check('request file still ignored', partsResult.stats.followers === 0);
check('reports what it skipped', partsResult.ignored_files.length === 1);

console.log('\n[5] Failure messages a person can act on');
const cases = [
  ['a text file', new Blob(['this is not a zip at all, not even close'])],
  ['an empty file', new Blob([])],
];
for (const [label, blob] of cases) {
  let message = null;
  try { await analyzeArchive(blob); } catch (e) { message = e.message; }
  check(`${label} rejected with a real message`, typeof message === 'string' && message.length > 0);
}
let noData = null;
try {
  await analyzeArchive(buildZip([{ name: 'data/manifest.js', data: 'window.__THAR_CONFIG = {}' }]));
} catch (e) { noData = e.message; }
check('valid zip without follower data is flagged', noData === 'noFollowData');

console.log('\n[6] classify() parity with Python, case by case');
const paths = [
  'data/follower.js', 'data/following.js', 'data/followers.js', 'data/following-part1.js',
  'data/follower-part2.json', 'data/following_part3.js', 'data/account.js', 'data/profile.js',
  'follower.js', 'data\\follower.js', 'data/follower-requests-sent.js',
  'data/follower-requests-received.js', 'data/following-requests.js', 'data/smartblock-following.js',
  'data/unfollowed-accounts.js', 'data/follower.js.bak', 'data/my-follower.js', 'data/tweets.js',
];
if (!PYTHON) { console.log('      SKIPPED — no Python to compare against'); skipped += 1; } else {
  const pyClassify = JSON.parse(py(`
import sys, json
sys.path.insert(0, "${PROJECT}")
import archive_parser
print(json.dumps({p: archive_parser.classify(p) for p in ${JSON.stringify(paths)}}))
`));
  const mismatches = paths.filter(p => (classify(p) ?? null) !== pyClassify[p]);
  check(`all ${paths.length} paths classified identically in both languages`, mismatches.length === 0);
  mismatches.forEach(p => console.log(`        ${p}: js=${classify(p)} py=${pyClassify[p]}`));
}

console.log('\n[7] Handle extraction parity');
const objs = [
  { userLink: 'https://twitter.com/intent/user?user_id=1' },
  { userLink: 'https://twitter.com/realhandle' },
  { screenName: '@fromfield' },
  { userLink: 'https://x.com/i/user/12345' },
  { username: 'plain' },
  {},
  // Junk and hostile inputs: these are where two implementations of one algorithm
  // quietly diverge, and where a bad handle would build a bogus profile link.
  { userLink: 'not a url at all' },
  { userLink: 'https://x.com/with space' },
  { userLink: 'https://x.com/../../etc/passwd' },
  { userLink: 'https://x.com/<script>' },
  { userLink: 'https://x.com/نام' },
  { userLink: 'https://x.com/' },
  { userLink: '' },
  { userLink: 'https://x.com/waaaaaaaaaaaaaaytoolongtobeahandle' },
  { userLink: 'javascript:alert(1)' },
  { screenName: 'has space' },
  { screenName: '' },
  { userLink: 'https://x.com/Good_Handle_9' },
  { userLink: 'https://x.com/HOME' },
  { userLink: null },
  { userLink: 12345 },
];
if (!PYTHON) { console.log('      SKIPPED — no Python to compare against'); skipped += 1; } else {
  const pyHandles = JSON.parse(execFileSync(PYTHON, ['-c', `
import sys, json
sys.path.insert(0, "${PROJECT}")
import archive_parser
print(json.dumps([archive_parser.extract_username(o) for o in json.loads(sys.argv[1])]))
`, JSON.stringify(objs)], { encoding: 'utf8' }));
  const jsHandles = objs.map(extractUsername);
  check('handles identical in both languages', JSON.stringify(jsHandles) === JSON.stringify(pyHandles));
  if (JSON.stringify(jsHandles) !== JSON.stringify(pyHandles)) {
    console.log('    js:', JSON.stringify(jsHandles), '\n    py:', JSON.stringify(pyHandles));
  }
}

console.log('\n[8] Only the files it needs are decompressed');
let reads = 0;
const big = buildZip([
  { name: 'data/following.js', data: ytd('following', [entry('following', '1')]) },
  { name: 'data/follower.js', data: ytd('follower', []) },
  ...Array.from({ length: 40 }, (_, i) => ({ name: `data/media_${i}.js`, data: 'x'.repeat(5000) })),
]);
const zip = await openZip(big);
const originalRead = zip.read;
check('archive has 42 entries', zip.entries.length === 42);
const relevant = zip.entries.filter(e => ['data/following.js', 'data/follower.js'].includes(e.name));
check('only 2 are recognised as needed', relevant.length === 2);

console.log('\n[9] Progress is measured, not guessed');
// The busy screen used to be three blinking dots for what can be a multi-gigabyte read.
// The numbers behind the bar have to come from the reader: a bar that goes backwards, or
// stops short, or arrives before the work does, is worse than no bar at all.
const fractions = [];
const phases = new Set();
const wide = buildZip([
  { name: 'data/following.js', data: ytd('following', Array.from({ length: 400 }, (_, i) => entry('following', String(3000 + i)))) },
  { name: 'data/follower.js', data: ytd('follower', Array.from({ length: 200 }, (_, i) => entry('follower', String(3000 + i)))), store: true },
  ...Array.from({ length: 30 }, (_, i) => ({ name: `data/media_${i}.js`, data: 'x'.repeat(20000) })),
]);
await analyzeArchive(wide, {
  onProgress: (p) => { fractions.push(p.fraction); phases.add(p.phase); },
});
check('progress is reported more than once', fractions.length >= 3);
check('both passes report: the directory scan and the read',
      phases.has('directory') && phases.has('read'));
check('every fraction is a number between 0 and 1',
      fractions.every((f) => typeof f === 'number' && f >= 0 && f <= 1));
check('the bar never goes backwards between the two passes',
      fractions.every((f, i) => i === 0 || f >= fractions[i - 1]));
check('the scan does not fill the bar before the read begins',
      Math.max(...fractions.filter((_, i) => i < fractions.length - 1)) < 1);
check('it arrives at 1 exactly when the work is done', fractions.at(-1) === 1);

// Left beside the fixture for eyeballing when a parity check fails.
if (jsResult) writeFileSync(join(SCRATCH, 'js_parity.json'), JSON.stringify(jsResult, null, 2));
const tail = skipped ? `, ${skipped} section(s) skipped` : '';
console.log('\n' + '='.repeat(52) + `\n  ${ok} passed, ${fail} failed${tail}\n` + '='.repeat(52));
process.exit(fail ? 1 : 0);
