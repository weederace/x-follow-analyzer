"""
run_all.py — every suite, one command:  python tests/run_all.py

There are six, in two languages, because the project has two of everything: a Python
reader and a JavaScript reader that must agree, a Python desktop app and a JavaScript
web app that must share one history file.

    test_parser.py     the Python archive reader, and the bug that started this
    test_server.py     the loopback API and its Origin/Host guard
    test_desktop.py    the Tkinter triage desk, driven through a fake Tk
    test_android.py    the APK's icons and launch screen, without an Android SDK
    test_analyzer.mjs  the in-page reader, checked line by line against Python
    test_frontend.mjs  the web app, driven through a fake DOM

Node is optional: without it you still get the Python three, and the summary says
plainly what did not run rather than reporting success for a job half done.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

PY_SUITES = ["test_parser.py", "test_server.py", "test_desktop.py", "test_android.py"]
JS_SUITES = ["test_analyzer.mjs", "test_frontend.mjs"]


def run(label: str, argv: list[str]) -> bool:
    print(f"\n{'-' * 68}\n  {label}\n{'-' * 68}")
    result = subprocess.run(argv, cwd=str(HERE.parent))
    return result.returncode == 0


def main() -> int:
    passed, failed, missing = [], [], []

    for name in PY_SUITES:
        (passed if run(name, [sys.executable, str(HERE / name)]) else failed).append(name)

    node = shutil.which("node")
    for name in JS_SUITES:
        if not node:
            missing.append(name)
            continue
        (passed if run(name, [node, str(HERE / name)]) else failed).append(name)

    print(f"\n{'=' * 68}")
    print(f"  {len(passed)} suite(s) passed" + (f", {len(failed)} failed" if failed else ""))
    for name in failed:
        print(f"    FAILED  {name}")
    if missing:
        print("  Node is not installed, so these did not run:")
        for name in missing:
            print(f"    SKIPPED {name}")
        print("  The web app and the parser-parity checks are untested without it.")
    print("=" * 68)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
