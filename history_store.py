"""
history_store.py
================
Shared, hardened persistence for the "processed profiles" history.

Both entrypoints (x_analyzer_server.py and x_follow_analyzer.py) use this module so
the web dashboard and the desktop GUI share one history.

Security / privacy design notes
-------------------------------
The history is a list of X account IDs the user has already reviewed. That is
private data: it reveals which accounts a specific person follows. This project is
distributed publicly on GitHub and cloned by strangers who run it on their own
machines, so storage is deliberately NOT inside the project directory:

* Writing into the repo means one careless `git add -f` (or re-publishing the folder
  as a new repo, or zipping it to send to someone) leaks the user's data. Being in
  .gitignore is not a real guarantee.
* Instead the file lives in the per-user application-data directory, which every
  modern OS already protects with per-account permissions.
* On POSIX the directory is 0700 and the file 0600, so other local accounts cannot
  read it.
* Writes are atomic (temp file + os.replace) so an interrupted save or a full disk
  cannot corrupt an existing history.
* Input is validated: only digit strings of sane length are stored, and the total is
  capped, so a malicious archive or a forged API call cannot make us write unbounded
  junk to the user's disk.

Locations
---------
Windows : %LOCALAPPDATA%\\XFollowAnalyzer\\processed_history.json
macOS   : ~/Library/Application Support/XFollowAnalyzer/processed_history.json
Linux   : $XDG_DATA_HOME/x-follow-analyzer/processed_history.json
          (falls back to ~/.local/share/x-follow-analyzer/)

Set XFA_HISTORY_DIR to put it somewhere else — an encrypted volume, say.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

APP_DIR_NAME_WIN = "XFollowAnalyzer"
APP_DIR_NAME_POSIX = "x-follow-analyzer"
HISTORY_FILENAME = "processed_history.json"

# An X account ID is a snowflake-ish decimal string. Anything else is rejected.
MAX_ID_LEN = 32
MAX_ENTRIES = 200_000


def _data_dir() -> Path:
    """
    Per-user application-data directory, created if missing.

    XFA_HISTORY_DIR overrides the location. It exists for two reasons: someone who
    wants this file on an encrypted volume can point it there, and the test suites
    redirect it in a way that survives a module re-import — a suite that ran against
    the real path would erase the history of whoever cloned the repo.
    """
    override = os.environ.get("XFA_HISTORY_DIR")
    if override:
        path = Path(override).expanduser()
    elif sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        root = Path(base) if base else Path.home() / "AppData" / "Local"
        path = root / APP_DIR_NAME_WIN
    elif sys.platform == "darwin":
        path = Path.home() / "Library" / "Application Support" / APP_DIR_NAME_WIN
    else:
        base = os.environ.get("XDG_DATA_HOME")
        root = Path(base) if base else Path.home() / ".local" / "share"
        path = root / APP_DIR_NAME_POSIX

    path.mkdir(parents=True, exist_ok=True)
    if not sys.platform.startswith("win"):
        try:
            os.chmod(path, 0o700)
        except OSError:
            pass  # non-fatal: e.g. exotic filesystem that ignores modes
    return path


def history_path() -> Path:
    return _data_dir() / HISTORY_FILENAME


def _clean(ids) -> list[str]:
    """Keep only plausible account IDs, de-duplicated, order preserved."""
    seen: set[str] = set()
    out: list[str] = []
    if not isinstance(ids, (list, tuple, set)):
        return out
    for raw in ids:
        if isinstance(raw, (int, float)) and not isinstance(raw, bool):
            raw = str(int(raw))
        if not isinstance(raw, str):
            continue
        val = raw.strip()
        if not val or len(val) > MAX_ID_LEN or not val.isdigit():
            continue
        if val in seen:
            continue
        seen.add(val)
        out.append(val)
        if len(out) >= MAX_ENTRIES:
            break
    return out


def _legacy_paths() -> list[Path]:
    """Old in-repo location(s) used before storage moved out of the project dir."""
    here = Path(__file__).resolve().parent
    return [here / HISTORY_FILENAME, Path.cwd() / HISTORY_FILENAME]


def load() -> list[str]:
    """
    Return the stored history.

    On first run, transparently migrates any legacy in-repo processed_history.json
    so upgrading users keep the profiles they already reviewed. The legacy file is
    left untouched on disk (it is gitignored); we simply stop writing to it.
    """
    path = history_path()
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as fh:
                return _clean(json.load(fh))
        except (OSError, ValueError):
            return []

    for legacy in _legacy_paths():
        try:
            if legacy.exists() and legacy.resolve() != path.resolve():
                with legacy.open("r", encoding="utf-8") as fh:
                    migrated = _clean(json.load(fh))
                if migrated:
                    save(migrated)
                    return migrated
        except (OSError, ValueError):
            continue
    return []


def save(ids) -> list[str]:
    """Atomically persist the history. Returns what was actually written."""
    cleaned = _clean(ids)
    path = history_path()
    tmp_name = None
    try:
        fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=".hist-", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(cleaned, fh, ensure_ascii=False)
            fh.flush()
            os.fsync(fh.fileno())
        if not sys.platform.startswith("win"):
            try:
                os.chmod(tmp_name, 0o600)
            except OSError:
                pass
        os.replace(tmp_name, path)  # atomic on POSIX and Windows
        tmp_name = None
    except OSError as exc:
        print(f"[history] could not save history: {exc}")
    finally:
        if tmp_name and os.path.exists(tmp_name):
            try:
                os.unlink(tmp_name)
            except OSError:
                pass
    return cleaned


def add(ids) -> list[str]:
    """Merge new IDs into the history. Returns the full updated list."""
    current = load()
    known = set(current)
    for val in _clean(ids):
        if val not in known:
            known.add(val)
            current.append(val)
    return save(current)


def remove(ids) -> list[str]:
    """
    Drop IDs from the history. This is the undo behind a mis-clicked profile: without
    it, one stray keypress retires an account from the queue for good.
    """
    drop = set(_clean(ids))
    if not drop:
        return load()
    return save([val for val in load() if val not in drop])


def clear() -> list[str]:
    """Erase the history."""
    return save([])
