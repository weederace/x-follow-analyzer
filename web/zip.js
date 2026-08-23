/**
 * zip.js — a small, dependency-free ZIP reader.
 *
 * Why not JSZip: this app has to run offline, including inside the Android WebView,
 * so it cannot pull a library from a CDN at load time. Everything here is built on
 * two platform primitives: Blob.slice() and DecompressionStream('deflate-raw').
 *
 * Why slices rather than one big ArrayBuffer: an X archive with media can be several
 * gigabytes, and reading it whole would blow up a phone's memory for the sake of the
 * three small files we actually need. Instead we read the tail to find the central
 * directory, read the directory, and then read only the entries we want.
 *
 * Supported: stored (method 0), deflate (method 8), and ZIP64 central directories.
 */

const EOCD_SIG = 0x06054b50;
const EOCD64_SIG = 0x06064b50;
const LOCATOR64_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;

const U32_MAX = 0xffffffff;
const U16_MAX = 0xffff;

/** A ZIP comment can be 64 KB, so the end record sits within the last ~64 KB + 22. */
const TAIL_BYTES = 65557 + 20;

/**
 * Carries a short `code` as well as a message. The UI shows its own wording in the
 * reader's language and uses the code to pick it; the message is the fallback.
 */
class ZipError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function sliceBytes(blob, start, end) {
  const clampedStart = Math.max(0, start);
  const clampedEnd = Math.min(blob.size, end);
  if (clampedEnd <= clampedStart) return new Uint8Array(0);
  const buffer = await blob.slice(clampedStart, clampedEnd).arrayBuffer();
  return new Uint8Array(buffer);
}

function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Reads a u64 as a Number. Real archives stay far below 2^53, so this is safe. */
function readU64(dv, offset) {
  const value = dv.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError('tooLarge', 'Archive is too large to read.');
  return Number(value);
}

function findSignature(bytes, signature) {
  const dv = view(bytes);
  for (let i = bytes.length - 4; i >= 0; i -= 1) {
    if (dv.getUint32(i, true) === signature) return i;
  }
  return -1;
}

/**
 * Locate the central directory, transparently upgrading to ZIP64 when the classic
 * 32-bit fields are saturated.
 */
async function readDirectoryBounds(blob) {
  const tail = await sliceBytes(blob, blob.size - TAIL_BYTES, blob.size);
  const eocdAt = findSignature(tail, EOCD_SIG);
  if (eocdAt === -1) {
    throw new ZipError('notZip', 'This file is not a ZIP archive.');
  }

  const dv = view(tail);
  let entryCount = dv.getUint16(eocdAt + 10, true);
  let size = dv.getUint32(eocdAt + 12, true);
  let offset = dv.getUint32(eocdAt + 16, true);

  const needsZip64 = offset === U32_MAX || size === U32_MAX || entryCount === U16_MAX;
  if (needsZip64) {
    const locatorAt = findSignature(tail.subarray(0, eocdAt), LOCATOR64_SIG);
    if (locatorAt === -1) throw new ZipError('damaged', 'This ZIP archive is damaged (missing ZIP64 locator).');
    const eocd64Offset = readU64(dv, locatorAt + 8);
    const record = await sliceBytes(blob, eocd64Offset, eocd64Offset + 56);
    const rdv = view(record);
    if (record.length < 56 || rdv.getUint32(0, true) !== EOCD64_SIG) {
      throw new ZipError('damaged', 'This ZIP archive is damaged (bad ZIP64 record).');
    }
    entryCount = readU64(rdv, 32);
    size = readU64(rdv, 40);
    offset = readU64(rdv, 48);
  }

  return { entryCount, size, offset };
}

/** Pull the ZIP64 overrides out of an extra field, in the order the spec requires. */
function applyZip64Extra(entry, extra) {
  const dv = view(extra);
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = dv.getUint16(cursor, true);
    const len = dv.getUint16(cursor + 2, true);
    const body = cursor + 4;
    if (id === 0x0001) {
      let at = body;
      if (entry.uncompressedSize === U32_MAX && at + 8 <= body + len) {
        entry.uncompressedSize = readU64(dv, at); at += 8;
      }
      if (entry.compressedSize === U32_MAX && at + 8 <= body + len) {
        entry.compressedSize = readU64(dv, at); at += 8;
      }
      if (entry.offset === U32_MAX && at + 8 <= body + len) {
        entry.offset = readU64(dv, at);
      }
      return;
    }
    cursor = body + len;
  }
}

/**
 * Open an archive. Returns the entry list plus a read() that decompresses one entry.
 * @param {Blob} blob
 */
export async function openZip(blob, { onProgress } = {}) {
  if (!blob || typeof blob.slice !== 'function') throw new ZipError('empty', 'No file to read.');
  if (blob.size < 22) throw new ZipError('empty', 'This file is empty or truncated.');

  const bounds = await readDirectoryBounds(blob);
  const directory = await sliceBytes(blob, bounds.offset, bounds.offset + bounds.size);
  const dv = view(directory);
  const decoder = new TextDecoder('utf-8');

  const entries = [];
  let cursor = 0;
  while (cursor + 46 <= directory.length && entries.length < bounds.entryCount) {
    if (dv.getUint32(cursor, true) !== CENTRAL_SIG) break;

    const nameLength = dv.getUint16(cursor + 28, true);
    const extraLength = dv.getUint16(cursor + 30, true);
    const commentLength = dv.getUint16(cursor + 32, true);

    const entry = {
      name: decoder.decode(directory.subarray(cursor + 46, cursor + 46 + nameLength)),
      method: dv.getUint16(cursor + 10, true),
      compressedSize: dv.getUint32(cursor + 20, true),
      uncompressedSize: dv.getUint32(cursor + 24, true),
      offset: dv.getUint32(cursor + 42, true),
    };
    if (entry.compressedSize === U32_MAX || entry.uncompressedSize === U32_MAX || entry.offset === U32_MAX) {
      applyZip64Extra(entry, directory.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    }
    entries.push(entry);
    if (onProgress) onProgress({ phase: 'directory', scanned: entries.length, total: bounds.entryCount });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  if (entries.length === 0) throw new ZipError('damaged', 'This ZIP archive has no readable entries.');

  async function read(entry, { onProgress: entryProgress } = {}) {
    // The local header repeats the name and extra field, and its length varies, so
    // measure it before reading the data. Sizes come from the central directory,
    // which is authoritative even when the local header defers them to a descriptor.
    const header = await sliceBytes(blob, entry.offset, entry.offset + 30);
    const hdv = view(header);
    if (header.length < 30) throw new ZipError('damaged', `Entry "${entry.name}" is truncated.`);
    const dataStart = entry.offset + 30 + hdv.getUint16(26, true) + hdv.getUint16(28, true);
    const raw = await sliceBytes(blob, dataStart, dataStart + entry.compressedSize);

    if (entry.method === 0) {
      if (entryProgress) entryProgress({ phase: 'entry', read: raw.length, total: raw.length });
      return raw;
    }
    if (entry.method !== 8) throw new ZipError('unsupported', `Entry "${entry.name}" uses an unsupported compression method.`);

    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const chunks = [];
    let read = 0;
    const total = entry.uncompressedSize || 1;
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      read += value.length;
      if (entryProgress) entryProgress({ phase: 'entry', read, total });
    }
    const out = new Uint8Array(read);
    let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  }

  return { entries, read };
}

export { ZipError };
