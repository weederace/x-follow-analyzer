/**
 * minidom.mjs — just enough DOM to run web/app.js under Node.
 *
 * jsdom is not installable here (no registry access), and the controller only uses a
 * narrow slice of the platform: getElementById, a handful of selector shapes,
 * classList/dataset/style, append/remove, and events. This implements that slice and
 * nothing else, so a test failure means the app is wrong rather than the shim.
 */

const VOID_TAGS = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'kbd!not-void']);
const SELF_CLOSING = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source']);

class ClassList {
  constructor(node) { this.node = node; }
  get _set() {
    return new Set((this.node.attributes.class || '').split(/\s+/).filter(Boolean));
  }
  _write(set) { this.node.attributes.class = [...set].join(' '); }
  add(...names) { const s = this._set; names.forEach((n) => s.add(n)); this._write(s); }
  remove(...names) { const s = this._set; names.forEach((n) => s.delete(n)); this._write(s); }
  contains(name) { return this._set.has(name); }
  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : Boolean(force);
    if (on) this.add(name); else this.remove(name);
    return on;
  }
  get value() { return this.node.attributes.class || ''; }
}

function camel(name) { return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }
function dashed(name) { return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`); }

class Node {
  constructor(tag) {
    this.tagName = tag ? tag.toUpperCase() : '';
    this.localName = tag || '';
    this.attributes = {};
    this.children = [];
    this.parentNode = null;
    this.text = '';                 // own text, when this node holds only text
    this.listeners = new Map();
    this.style = new Proxy({}, { set: (o, k, v) => { o[k] = v; return true; } });
    this.classList = new ClassList(this);
    this.dataset = new Proxy({}, {
      get: (_, key) => this.attributes[`data-${dashed(String(key))}`],
      set: (_, key, value) => { this.attributes[`data-${dashed(String(key))}`] = String(value); return true; },
      has: (_, key) => `data-${dashed(String(key))}` in this.attributes,
    });
  }

  // ---- tree ----
  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof Fragment) { this.append(...[...node.children]); continue; }
      if (node.parentNode) node.parentNode.remove_(node);
      node.parentNode = this;
      this.children.push(node);
    }
  }
  appendChild(node) { this.append(node); return node; }
  remove_(node) { this.children = this.children.filter((c) => c !== node); }
  remove() { if (this.parentNode) this.parentNode.remove_(this); this.parentNode = null; }
  get childNodes() { return this.children; }

  descendants(out = []) {
    for (const child of this.children) { out.push(child); child.descendants(out); }
    return out;
  }

  // ---- attributes / props ----
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
  hasAttribute(name) { return name in this.attributes; }
  removeAttribute(name) { delete this.attributes[name]; }

  get hidden() { return 'hidden' in this.attributes; }
  set hidden(on) { if (on) this.attributes.hidden = ''; else delete this.attributes.hidden; }
  get disabled() { return 'disabled' in this.attributes; }
  set disabled(on) { if (on) this.attributes.disabled = ''; else delete this.attributes.disabled; }
  get id() { return this.attributes.id || ''; }
  get className() { return this.attributes.class || ''; }
  set className(v) { this.attributes.class = v; }
  get value() { return 'value' in this.attributes ? this.attributes.value : ''; }
  set value(v) { this.attributes.value = String(v); }
  get title() { return this.attributes.title || ''; }
  set title(v) { this.attributes.title = String(v); }
  get placeholder() { return this.attributes.placeholder || ''; }
  set placeholder(v) { this.attributes.placeholder = String(v); }
  set colSpan(v) { this.attributes.colspan = String(v); }
  get offsetWidth() { return 100; }   // read only to force a style flush

  get textContent() {
    if (this.children.length === 0) return this.text;
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(value) {
    this.children.forEach((c) => { c.parentNode = null; });
    this.children = [];
    this.text = String(value);
  }

  // ---- selectors ----
  querySelectorAll(selector) { return matchAll(selector, this.descendants(), this); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  // ---- events ----
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type, event = {}) {
    const ev = { type, target: this, preventDefault() {}, ...event };
    for (const fn of this.listeners.get(type) || []) fn(ev);
    // Events used here (click/keydown/input/change) all bubble.
    if (this.parentNode) this.parentNode.dispatch_bubble(type, ev);
    return ev;
  }
  dispatch_bubble(type, ev) {
    for (const fn of this.listeners.get(type) || []) fn(ev);
    if (this.parentNode) this.parentNode.dispatch_bubble(type, ev);
  }
}

class Fragment extends Node {
  constructor() { super(''); }
}

// ---------------------------------------------------------------------------
// Selector engine: #id, .class, tag, [attr], [attr="v"], :not(.x), descendants,
// and comma-separated lists. That is everything web/app.js asks for.
// ---------------------------------------------------------------------------
function parseSimple(part) {
  const test = { tag: null, classes: [], id: null, attrs: [], nots: [] };
  let rest = part;
  rest = rest.replace(/:not\(([^)]+)\)/g, (_, inner) => { test.nots.push(parseSimple(inner)); return ''; });
  rest = rest.replace(/\[([a-zA-Z-]+)(?:="([^"]*)")?\]/g, (_, name, value) => {
    test.attrs.push([name, value]); return '';
  });
  rest = rest.replace(/#([A-Za-z0-9_-]+)/g, (_, id) => { test.id = id; return ''; });
  rest = rest.replace(/\.([A-Za-z0-9_-]+)/g, (_, cls) => { test.classes.push(cls); return ''; });
  if (rest.trim()) test.tag = rest.trim().toUpperCase();
  return test;
}

function matchesSimple(node, test) {
  if (test.tag && node.tagName !== test.tag) return false;
  if (test.id && node.id !== test.id) return false;
  if (!test.classes.every((c) => node.classList.contains(c))) return false;
  for (const [name, value] of test.attrs) {
    if (!node.hasAttribute(name)) return false;
    if (value !== undefined && node.getAttribute(name) !== value) return false;
  }
  return test.nots.every((n) => !matchesSimple(node, n));
}

function matchAll(selector, pool, root) {
  const hits = [];
  for (const group of selector.split(',')) {
    const parts = group.trim().split(/\s+/).filter(Boolean).map(parseSimple);
    const last = parts[parts.length - 1];
    for (const node of pool) {
      if (!matchesSimple(node, last)) continue;
      let cursor = node.parentNode;
      let depth = parts.length - 2;
      while (depth >= 0 && cursor && cursor !== root.parentNode) {
        if (matchesSimple(cursor, parts[depth])) depth -= 1;
        cursor = cursor.parentNode;
      }
      if (depth < 0 && !hits.includes(node)) hits.push(node);
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// A forgiving parser for the markup this project actually ships.
// ---------------------------------------------------------------------------
export function parseHTML(source) {
  const body = new Node('body');
  const stack = [body];
  let cursor = 0;
  const html = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, '');

  while (cursor < html.length) {
    const open = html.indexOf('<', cursor);
    if (open === -1) { addText(stack.at(-1), html.slice(cursor)); break; }
    addText(stack.at(-1), html.slice(cursor, open));

    const close = html.indexOf('>', open);
    if (close === -1) break;
    const raw = html.slice(open + 1, close);
    cursor = close + 1;

    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim().toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].localName === name) { stack.length = i; break; }
      }
      continue;
    }

    const match = /^([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)$/.exec(raw);
    if (!match) continue;
    const [, tag, attrText, slash] = match;
    const node = new Node(tag.toLowerCase());
    for (const attr of attrText.matchAll(/([a-zA-Z-]+)(?:\s*=\s*"([^"]*)")?/g)) {
      node.attributes[attr[1].toLowerCase()] = attr[2] === undefined ? '' : attr[2];
    }
    stack.at(-1).append(node);

    // <script> and <style> hold text that must not be parsed as markup.
    if (tag.toLowerCase() === 'script' || tag.toLowerCase() === 'style') {
      const end = html.toLowerCase().indexOf(`</${tag.toLowerCase()}>`, cursor);
      if (end !== -1) { node.text = html.slice(cursor, end); cursor = end + tag.length + 3; }
      continue;
    }
    if (!slash && !SELF_CLOSING.has(tag.toLowerCase())) stack.push(node);
  }
  return body;
}

function addText(parent, chunk) {
  if (!chunk || !chunk.trim()) return;
  if (parent.children.length === 0) { parent.text += chunk; return; }
  const span = new Node('#text');
  span.text = chunk;
  parent.append(span);
}

// ---------------------------------------------------------------------------
// The document + the globals app.js expects
// ---------------------------------------------------------------------------
export function install(html) {
  const body = parseHTML(html);
  const root = new Node('html');
  root.append(body);

  const document = {
    documentElement: root,
    body,
    getElementById(id) { return body.descendants().find((n) => n.id === id) || null; },
    querySelectorAll(sel) { return matchAll(sel, body.descendants(), body); },
    querySelector(sel) { return document.querySelectorAll(sel)[0] || null; },
    createElement(tag) { return new Node(tag); },
    createDocumentFragment() { return new Fragment(); },
    addEventListener(type, fn) { body.addEventListener(type, fn); },
  };
  root.lang = 'fa';
  root.dir = 'rtl';

  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };

  const opened = [];
  const globals = {
    document,
    localStorage,
    matchMedia: () => ({ matches: false }),
    confirm: () => true,
    alert: () => {},
    setTimeout,
    clearTimeout,
    opened,
    // Handed back so a test can make pop-ups fail the way a blocker does.
    popupsBlocked: false,
  };
  globals.window = {
    open(url) {
      if (globals.popupsBlocked) return null;
      opened.push(url);
      return { closed: false };
    },
  };
  return globals;
}

export { Node };
