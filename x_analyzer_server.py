import zipfile
import io
import webbrowser
import threading
import time
from pathlib import Path


def missing_dependency_message(name: str) -> str:
    """The message someone sees when the web version's packages are not installed.

    This is the most likely way a first run fails: clone the repo, run this file, and
    read a ModuleNotFoundError whose last line names a package but not what to do about
    it. The message also points at the desktop app, because "install this" is not always
    the answer the reader wants — that one needs nothing but Python itself.

    English, like build-apk.ps1 and for the same reason: this text goes to a Windows
    console whose code page is not UTF-8, and a log that arrives as question marks is
    worse than a log in the wrong language.
    """
    return (
        f"\n  The web version needs a package that is not installed: {name}\n\n"
        "  Install what it needs:  python -m pip install -r requirements.txt\n"
        "  Then run this again:    python x_analyzer_server.py\n\n"
        "  Or skip installing anything. The desktop version needs only Python:\n"
        "      python x_follow_analyzer.py\n"
        "  (on Debian or Ubuntu it also needs:  sudo apt install python3-tk)\n"
    )


try:
    from fastapi import FastAPI, File, UploadFile, Request, HTTPException
    from fastapi.responses import Response
    import uvicorn
except ModuleNotFoundError as missing:
    # from None: the traceback is five frames of import machinery and the reader is
    # someone who wanted to look at a list of accounts, not debug a stack.
    raise SystemExit(missing_dependency_message(missing.name or "fastapi")) from None

import archive_parser
import history_store

HOST = "127.0.0.1"
PORT = 8000

# Reject uploads larger than this. A real X archive is well under it, and this stops
# a runaway file from exhausting memory (the ZIP is read fully into RAM).
MAX_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MB

app = FastAPI(title="X Follow Analyzer Pro Max")


# ==========================================
# 0. LOCAL-ONLY REQUEST GUARD
# ==========================================
# The server listens on loopback, but "loopback" is not the same as "private".
# Any website the user visits can make their browser send requests to
# http://127.0.0.1:8000 — that would let a random page read or wipe the user's
# review history (CSRF), and an attacker-controlled domain resolving to 127.0.0.1
# could try the same (DNS rebinding). We therefore require that:
#   * the Host header really is our loopback address, and
#   * the Origin header, when present, is our own page.
ALLOWED_HOSTS = {f"{HOST}:{PORT}", f"localhost:{PORT}"}
ALLOWED_ORIGINS = {f"http://{HOST}:{PORT}", f"http://localhost:{PORT}"}


def guard_local_request(request: Request, *, state_changing: bool) -> None:
    host = (request.headers.get("host") or "").lower()
    if host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="Invalid Host header.")

    origin = request.headers.get("origin")
    if origin and origin.lower() not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Cross-origin request refused.")

    # Browsers always attach Origin to cross-site state-changing fetches, so an
    # absent Origin on a write is only normal for non-browser clients (curl, tests).
    # Requiring one of Origin/Sec-Fetch-Site keeps forged form posts out.
    if state_changing and not origin:
        if request.headers.get("sec-fetch-site") not in (None, "same-origin"):
            raise HTTPException(status_code=403, detail="Cross-site request refused.")

# ==========================================
# 1. CORE LOGIC (BACKEND)
# ==========================================
# The parser used to live here, duplicated almost line for line in
# x_follow_analyzer.py. Both copies matched archive entries with a substring test
# (`"follower" in path`), which also caught follower-requests-sent.js and counted
# accounts you had merely *requested* to follow as real followers — so they looked
# mutual and quietly vanished from the results. It now lives in archive_parser.py,
# once, with an allowlist of exact filenames and a test suite behind it.

@app.post("/api/analyze")
async def analyze_archive(request: Request, file: UploadFile = File(...)):
    guard_local_request(request, state_changing=True)

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is too large to be an X archive.")

    try:
        followers, following, main_username, ignored = archive_parser.parse_archive(contents)
    except zipfile.BadZipFile:
        # Previously this bubbled up as an opaque HTTP 500 and the UI just said
        # "Error processing file", so a wrong file looked like a broken app.
        raise HTTPException(
            status_code=400,
            detail="That file is not a valid ZIP archive. Select the original .zip you downloaded from X.",
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read the archive: {exc}")

    if not followers and not following:
        raise HTTPException(
            status_code=422,
            detail="No follower/following data found in that archive. Make sure it is the full X data export.",
        )

    return archive_parser.analyze(followers, following, main_username, ignored)


# ==========================================
# 1b. PROCESSED-HISTORY API
# ==========================================
# History lives in a file in the per-user app-data directory (see history_store),
# not in the browser. localStorage was being wiped by private windows, "clear site
# data on exit" settings, switching default browser, and the fact that
# localhost:8000 and 127.0.0.1:8000 are separate origins with separate storage.

@app.get("/api/history")
async def get_history(request: Request):
    guard_local_request(request, state_changing=False)
    ids = history_store.load()
    return {"processed": ids, "count": len(ids)}


@app.post("/api/history")
async def add_history(request: Request):
    """Merge account IDs into the saved history. Body: {"ids": ["123", ...]}"""
    guard_local_request(request, state_changing=True)
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Expected a JSON body.")
    if not isinstance(payload, dict) or not isinstance(payload.get("ids"), list):
        raise HTTPException(status_code=400, detail='Expected {"ids": [...]}.')

    ids = history_store.add(payload["ids"])
    return {"processed": ids, "count": len(ids)}


@app.delete("/api/history")
async def delete_history(request: Request):
    """
    Erase the history, or with {"ids": [...]} put just those accounts back in the
    queue. The queue is a one-way door without this: one stray keypress used to
    retire a profile permanently.
    """
    guard_local_request(request, state_changing=True)
    try:
        payload = await request.json()
    except Exception:
        payload = None

    if isinstance(payload, dict) and isinstance(payload.get("ids"), list):
        ids = history_store.remove(payload["ids"])
    else:
        ids = history_store.clear()
    return {"processed": ids, "count": len(ids)}


# ==========================================
# 2. FRONTEND
# ==========================================
# The frontend used to be one 600-line Python string in this file, pulling Tailwind
# and Chart.js off a CDN — so "100% offline" was untrue on first load, and the same
# markup could not be reused for the Android build. It now lives in web/ as ordinary
# files that the browser, the packaged app, and an editor all understand.
#
# Files are served from a fixed allowlist rather than by mounting the directory.
# Strangers clone this repo and run it on their own machines: a mount serves whatever
# happens to be in the folder, and a path-traversal slip serves whatever is above it.
# A dict cannot be talked into serving x_analyzer_server.py or the history file.
WEB_DIR = Path(__file__).resolve().parent / "web"

SERVED_FILES = {
    "index.html": "text/html; charset=utf-8",
    "app.css": "text/css; charset=utf-8",
    "app.js": "text/javascript; charset=utf-8",
    "analyzer.js": "text/javascript; charset=utf-8",
    "zip.js": "text/javascript; charset=utf-8",
    "history.js": "text/javascript; charset=utf-8",
    "icon.svg": "image/svg+xml",
    "manifest.webmanifest": "application/manifest+json",
}


def _read_web_file(name: str) -> bytes:
    path = WEB_DIR / name
    try:
        return path.read_bytes()
    except OSError:
        raise HTTPException(
            status_code=500,
            detail=f"web/{name} is missing. Re-download the project folder so the interface files come with it.",
        )


@app.get("/{name}")
async def serve_asset(request: Request, name: str):
    guard_local_request(request, state_changing=False)
    media_type = SERVED_FILES.get(name)
    if media_type is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return Response(
        content=_read_web_file(name),
        media_type=media_type,
        # The files change whenever the project is updated, and this only ever serves
        # one local user, so re-reading from disk beats explaining a stale cache.
        headers={"Cache-Control": "no-store"},
    )


@app.get("/")
async def serve_frontend(request: Request):
    guard_local_request(request, state_changing=False)
    return Response(
        content=_read_web_file("index.html"),
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "no-store"},
    )

# ==========================================
# 3. AUTO-LAUNCHER
# ==========================================
def open_browser():
    time.sleep(1.5)
    webbrowser.open(f"http://{HOST}:{PORT}")

if __name__ == "__main__":
    # ASCII on purpose. This goes to a Windows console, and when someone redirects the
    # output to a file Python encodes it with the machine's legacy code page, where one
    # non-ASCII character raises UnicodeEncodeError and takes the server down before it
    # has served a page. tests/run_all.py keeps the same rule for the same reason.
    print("X Follow Analyzer")
    print(f"   Dashboard : http://{HOST}:{PORT}")
    print(f"   History   : {history_store.history_path()}")
    print("   Press Ctrl+C to stop.")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="warning")