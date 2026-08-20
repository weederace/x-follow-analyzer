"""
fixture.py — the archive both parser suites are measured against.

It lives in one file because the whole point of test_analyzer.mjs is that the JavaScript
reader and the Python reader agree *on the same bytes*. Two copies of the fixture would
let them agree on a technicality while disagreeing on a real archive.

Run it directly to write the ZIP somewhere:  python tests/fixture.py out.zip
That is how the Node suite gets a copy, so neither suite depends on the other having
run first.

The shape, and why each file is here
------------------------------------
100, 101       mutual — followed both ways
200, 201, 202  we follow them, they do not follow back  => all three must be reported
300            follows us, we do not follow them
202 also appears in follower-requests-sent.js, which is exactly where the bug lived:
substring matching on "follower" filed it as a follower, so it looked mutual and
vanished from the results.
"""

import io
import json
import sys
import zipfile

FOLLOWING = ["100", "101", "200", "201", "202"]
FOLLOWERS = ["100", "101", "300"]
USERNAME = "ashka"


def ytd(kind, rows):
    """Recreate the window.YTD.<kind>.part0 = [...] wrapper, BOM included."""
    return ("﻿" + f"window.YTD.{kind}.part0 = " + json.dumps(rows)).encode("utf-8")


def entry(wrapper, aid):
    return {wrapper: {"accountId": aid,
                      "userLink": f"https://twitter.com/intent/user?user_id={aid}"}}


def build() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("data/following.js",
                   ytd("following", [entry("following", a) for a in FOLLOWING]))
        z.writestr("data/follower.js",
                   ytd("follower", [entry("follower", a) for a in FOLLOWERS]))
        z.writestr("data/account.js",
                   ytd("account", [{"account": {"username": USERNAME, "accountId": "1"}}]))

        # --- files that merely mention follow, and must be ignored ---
        z.writestr("data/follower-requests-sent.js",
                   ytd("followerRequestsSent", [entry("follower", "202"), entry("follower", "999")]))
        z.writestr("data/follower-requests-received.js", ytd("x", [entry("follower", "888")]))
        z.writestr("data/following-requests.js", ytd("x", [entry("following", "777")]))
        z.writestr("data/smartblock-following.js", ytd("x", [entry("following", "666")]))
        z.writestr("data/unfollowed-accounts.js", ytd("x", [entry("following", "555")]))
        # unrelated bulk, like a real archive
        z.writestr("data/tweets.js", ytd("tweets", [{"tweet": {"id": "1"}}]))
        z.writestr("data/manifest.js", "window.__THAR_CONFIG = {}")
    return buf.getvalue()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python fixture.py <output.zip>")
    with open(sys.argv[1], "wb") as fh:
        fh.write(build())
