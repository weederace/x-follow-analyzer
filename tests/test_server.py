"""
Offline test: stubs fastapi/uvicorn so we can exercise the real server module.

This suite erases and rewrites the history, so it runs against a throwaway copy —
see sandbox.py. It must be redirected before x_analyzer_server is imported.
"""
import sys, types, asyncio, json, pathlib, re

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import sandbox
sandbox.redirect("xsrv-")

# ---- minimal fastapi / uvicorn stubs -------------------------------------
class HTTPException(Exception):
    def __init__(self, status_code, detail=""):
        self.status_code, self.detail = status_code, detail
        super().__init__(f"{status_code}: {detail}")

class _Req:
    def __init__(self, headers=None, body=None):
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}
        self._body = body
    async def json(self):
        if self._body is None: raise ValueError("no body")
        return self._body

class _App:
    def __init__(self, **kw): pass
    def _dec(self, *a, **k):
        def wrap(fn): return fn
        return wrap
    get = post = delete = put = _dec

fa = types.ModuleType("fastapi")
fa.FastAPI = _App
fa.HTTPException = HTTPException
fa.Request = _Req
fa.File = lambda *a, **k: None
fa.UploadFile = object
resp = types.ModuleType("fastapi.responses")
class Response:
    def __init__(self, content=None, media_type=None, headers=None, **kw):
        self.body, self.media_type, self.headers = content, media_type, headers or {}
resp.Response = Response
resp.HTMLResponse = lambda **kw: None
fa.responses = resp
sys.modules["fastapi"] = fa
sys.modules["fastapi.responses"] = resp
uv = types.ModuleType("uvicorn"); uv.run = lambda *a, **k: None
sys.modules["uvicorn"] = uv

PROJECT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT))
import x_analyzer_server as srv
import history_store

run = asyncio.get_event_loop().run_until_complete
GOOD = {"host": "127.0.0.1:8000", "origin": "http://127.0.0.1:8000"}
ok = fail = 0

def check(label, cond):
    global ok, fail
    if cond: ok += 1; print(f"  PASS  {label}")
    else:    fail += 1; print(f"  FAIL  {label}")

def blocked(coro_fn, headers, body=None):
    """True if the guard rejected the request with 403."""
    try:
        run(coro_fn(_Req(headers, body)) if body is None else coro_fn(_Req(headers, body)))
        return False
    except HTTPException as e:
        return e.status_code == 403

print("\n[1] Origin / Host guard on GET /api/history")
check("legitimate same-origin request allowed", not blocked(srv.get_history, GOOD))
check("localhost origin also allowed",
      not blocked(srv.get_history, {"host": "localhost:8000", "origin": "http://localhost:8000"}))
check("malicious site origin REJECTED",
      blocked(srv.get_history, {"host": "127.0.0.1:8000", "origin": "https://evil.example"}))
check("DNS-rebinding host REJECTED",
      blocked(srv.get_history, {"host": "evil.example", "origin": "http://127.0.0.1:8000"}))
check("wrong port REJECTED", blocked(srv.get_history, {"host": "127.0.0.1:9999"}))
check("no headers at all REJECTED", blocked(srv.get_history, {}))

print("\n[2] Guard on state-changing writes")
check("cross-site POST REJECTED",
      blocked(srv.add_history, {"host": "127.0.0.1:8000", "origin": "https://evil.example"}, {"ids": ["1"]}))
check("cross-site DELETE REJECTED",
      blocked(srv.delete_history, {"host": "127.0.0.1:8000", "origin": "https://evil.example"}))
check("forged POST w/o Origin but cross-site fetch metadata REJECTED",
      blocked(srv.add_history, {"host": "127.0.0.1:8000", "sec-fetch-site": "cross-site"}, {"ids": ["1"]}))

print("\n[3] History round-trip (the actual restart bug)")
history_store.clear()
run(srv.add_history(_Req(GOOD, {"ids": ["111", "222", "333"]})))
first = run(srv.get_history(_Req(GOOD)))
check("3 ids saved", first["count"] == 3)

# Simulate a full app restart: drop the module and re-import from disk.
del sys.modules["history_store"]; del sys.modules["x_analyzer_server"]
import x_analyzer_server as srv2
after = run(srv2.get_history(_Req(GOOD)))
check("SURVIVES RESTART -> ids still there", sorted(after["processed"]) == ["111", "222", "333"])

run(srv2.add_history(_Req(GOOD, {"ids": ["222", "444"]})))
merged = run(srv2.get_history(_Req(GOOD)))
check("merge dedupes, no duplicates", sorted(merged["processed"]) == ["111", "222", "333", "444"])

print("\n[4] Input validation on writes")
run(srv2.add_history(_Req(GOOD, {"ids": ["../../etc/passwd", "<script>", "", "abc", 12345]})))
res = run(srv2.get_history(_Req(GOOD)))
check("junk/traversal/script ids rejected",
      all(i.isdigit() for i in res["processed"]) and "12345" in res["processed"])
try:
    run(srv2.add_history(_Req(GOOD, {"nope": 1}))); check("malformed body rejected", False)
except HTTPException as e:
    check("malformed body rejected with 400", e.status_code == 400)

print("\n[5] Archive error handling (was an opaque HTTP 500)")
class FakeUpload:
    def __init__(self, data): self._d = data
    async def read(self): return self._d
def analyze(data):
    try:
        run(srv2.analyze_archive(_Req(GOOD), FakeUpload(data))); return None
    except HTTPException as e:
        return e.status_code
check("not-a-zip -> 400 not 500", analyze(b"this is not a zip file") == 400)
check("empty file -> 400", analyze(b"") == 400)
check("oversized upload -> 413", analyze(b"x" * (srv2.MAX_UPLOAD_BYTES + 1)) == 413)

import io, zipfile
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z:
    z.writestr("data/manifest.js", "window.__THAR_CONFIG = {}")
check("valid zip w/o follower data -> 422", analyze(buf.getvalue()) == 422)

print("\n[6] The endpoint really serves the fixed parser, not a stale copy")
# The point of extracting archive_parser was that the fix reaches the running app.
# This drives the HTTP handler end to end over the same fixture the parser tests use,
# so a future re-inlining of the parser would break here rather than pass silently.
def analyze_ok(data):
    return run(srv2.analyze_archive(_Req(GOOD), FakeUpload(data)))

fixture = pathlib.Path("/tmp/fixture_archive.zip")
if fixture.is_file():
    payload = analyze_ok(fixture.read_bytes())
    ids = [r["account_id"] for r in payload["not_following"]]
    check("account 202 reaches the API response", "202" in ids)
    check("no ids leaked from follower-requests-sent.js",
          not ({"999", "888", "777", "666", "555"} & set(ids)))
    check("followers not inflated by request files", payload["stats"]["followers"] == 3)
    check("handle read from account.js", payload["account_username"] == "ashka")
    check("the API reports which files it skipped", len(payload["ignored_files"]) == 5)
else:
    check("fixture archive present (run test_parser.py first)", False)

print("\n[7] DELETE /api/history with ids = the undo behind a mis-click")
history_store_mod = sys.modules["history_store"]
history_store_mod.save(["111", "222", "333"])
run(srv2.delete_history(_Req(GOOD, {"ids": ["222"]})))
left = run(srv2.get_history(_Req(GOOD)))
check("only the named id is put back in the queue", left["processed"] == ["111", "333"])
run(srv2.delete_history(_Req(GOOD, {"ids": ["nope", "../x"]})))
check("junk ids in an undo remove nothing",
      run(srv2.get_history(_Req(GOOD)))["processed"] == ["111", "333"])
run(srv2.delete_history(_Req(GOOD)))
check("bodyless DELETE still wipes everything", run(srv2.get_history(_Req(GOOD)))["count"] == 0)

print("\n[8] Static assets: allowlist only, nothing above it")
WEB = PROJECT / "web"
for name in srv2.SERVED_FILES:
    check(f"web/{name} exists on disk", (WEB / name).is_file())

served = run(srv2.serve_asset(_Req(GOOD), "app.css"))
check("app.css served with a CSS content type", served.media_type.startswith("text/css"))
check("assets are never cached", served.headers.get("Cache-Control") == "no-store")
check("index.html is what / returns",
      run(srv2.serve_frontend(_Req(GOOD))).body == (WEB / "index.html").read_bytes())

def refused(name):
    try:
        run(srv2.serve_asset(_Req(GOOD), name)); return False
    except HTTPException as e:
        return e.status_code == 404
check("the server module itself is NOT servable", refused("x_analyzer_server.py"))
check("the history file is NOT servable", refused("processed_history.json"))
check("path traversal is NOT servable", refused("../x_analyzer_server.py"))
check("absolute path is NOT servable", refused("/etc/passwd"))
check("asset requests are guarded too", blocked(lambda r: srv2.serve_asset(r, "app.css"),
                                                {"host": "evil.example"}))

# A file referenced by the page but absent from SERVED_FILES 404s at runtime, which
# is exactly the kind of break nobody notices until a user reports a blank page.
page = (WEB / "index.html").read_text(encoding="utf-8")
referenced = set(re.findall(r'(?:href|src)="(?:\./)?([A-Za-z0-9._-]+\.[A-Za-z0-9]+)"', page))
referenced |= set(re.findall(r"from '(?:\./)?([A-Za-z0-9._-]+\.[A-Za-z0-9]+)'",
                            (WEB / "app.js").read_text(encoding="utf-8")))
missing = sorted(n for n in referenced if n not in srv2.SERVED_FILES)
check(f"every file the page asks for is in the allowlist ({len(referenced)} refs)", not missing)
if missing:
    print(f"        missing from SERVED_FILES: {missing}")
# ...and the reverse: an allowlisted file nobody loads is dead weight to explain later.
unused = sorted(n for n in srv2.SERVED_FILES if n != "index.html" and n not in referenced)
check("no allowlisted file is unreferenced", not unused)
if unused:
    print(f"        in SERVED_FILES but never loaded: {unused}")

history_store_mod.clear()
print(f"\n{'='*46}\n  {ok} passed, {fail} failed\n{'='*46}")
sys.exit(1 if fail else 0)
