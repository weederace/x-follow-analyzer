"""
sandbox.py — make it impossible for a test run to touch the real review history.

The Python suites exercise saving, merging, undoing and *erasing* the history. Run
against the real file, test_server.py alone would wipe the list of accounts you have
already been through. So every suite calls redirect() before importing anything that
writes.

Why an environment variable rather than monkeypatching the module: test_server.py
deliberately deletes history_store from sys.modules and imports it again, to prove two
processes can share one file without clobbering each other. A patched function object
would not survive that. XFA_HISTORY_DIR is read at call time, so it does.

The empty store is written immediately, which also disables the legacy-migration path
in history_store.load() — a real feature for upgrading users, and one that would
otherwise pull whatever processed_history.json is sitting in the repo into the
assertions.
"""

from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def redirect(prefix: str = "xfa-test-") -> Path:
    """Point the history at a throwaway directory. Returns it, for fixture files."""
    scratch = Path(tempfile.mkdtemp(prefix=prefix))
    os.environ["XFA_HISTORY_DIR"] = str(scratch / "store")
    atexit.register(shutil.rmtree, scratch, ignore_errors=True)

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    import history_store
    history_store.save([])          # start empty, and never consult the legacy path
    return scratch
