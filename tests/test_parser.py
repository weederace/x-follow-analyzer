"""
Builds a realistic X archive ZIP and proves the file-matching bug is fixed.

The point of the fixture: it contains follower-requests-sent.js, a real file X ships,
holding an account that the user follows and who does NOT follow back. Under the old
substring matching that account got filed as a follower, so it looked like a mutual and
disappeared from the results.
"""
import io, json, sys, zipfile, pathlib

# The repo is one level up from tests/, so the suite runs from a clone anywhere.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import archive_parser as ap
import fixture
from fixture import ytd, entry, FOLLOWING, FOLLOWERS

ok = fail = 0
def check(label, cond):
    global ok, fail
    if cond: ok += 1; print(f"  PASS  {label}")
    else:    fail += 1; print(f"  FAIL  {label}")

# ---------------------------------------------------------------------------
# The fixture
# ---------------------------------------------------------------------------
# See fixture.py for what is in it and why. It is shared with the JavaScript parity
# suite so both readers are measured against the same bytes.
ARCHIVE = fixture.build()

# ---------------------------------------------------------------------------
# 1. The old logic, verbatim, to show the bug was real
# ---------------------------------------------------------------------------
def old_parse(file_bytes):
    followers, following = {}, {}
    with zipfile.ZipFile(io.BytesIO(file_bytes), "r") as z:
        for filename in z.namelist():
            lower = filename.lower()
            if not (lower.endswith(".js") or lower.endswith(".json")): continue
            is_conn = "follower" in lower or "following" in lower
            if not is_conn: continue
            try: raw = z.read(filename).decode("utf-8-sig")
            except Exception: continue
            start = raw.find("[")
            if start == -1: continue
            body = raw[start:].strip()
            if body.endswith(";"): body = body[:-1].strip()
            try: data = json.loads(body)
            except Exception: continue
            is_follower_file = "follower" in lower and "following" not in lower
            for item in data:
                if not isinstance(item, dict): continue
                if is_follower_file:
                    obj = item.get("follower", item)
                    if isinstance(obj, dict) and (obj.get("accountId") or obj.get("id")):
                        followers[str(obj.get("accountId") or obj.get("id"))] = ""
                else:
                    obj = item.get("following", item)
                    if isinstance(obj, dict) and (obj.get("accountId") or obj.get("id")):
                        following[str(obj.get("accountId") or obj.get("id"))] = ""
    return followers, following

print("\n[1] The bug, reproduced against the old logic")
old_followers, old_following = old_parse(ARCHIVE)
old_missing = set(old_following) - set(old_followers)
check("old logic invented followers that don't exist", len(old_followers) > len(FOLLOWERS))
check("old logic HID account 202 from the results", "202" not in old_missing)
check("old logic leaked ids from unrelated follow files",
      {"999", "888", "777", "666", "555"} & (set(old_followers) | set(old_following)) != set())

print("\n[2] Fixed logic reads only the real follower/following files")
followers, following, handle, ignored = ap.parse_archive(ARCHIVE)
check("followers are exactly the real ones", sorted(followers) == sorted(FOLLOWERS))
check("following are exactly the real ones", sorted(following) == sorted(FOLLOWING))
check("account handle read from account.js", handle == "ashka")
check("account 202 is back in the not-following-back list",
      sorted(set(following) - set(followers)) == ["200", "201", "202"])
check("the skipped follow-adjacent files are reported, not hidden", len(ignored) == 5)

print("\n[3] classify() on the names X actually ships")
cases = {
    "data/follower.js": "follower", "data/following.js": "following",
    "data/followers.js": "follower",                      # plural, just in case
    "data/following-part1.js": "following",               # split large accounts
    "data/follower-part2.json": "follower",
    "data/following_part3.js": "following",
    "data/account.js": "profile", "data/profile.js": "profile",
    "follower.js": "follower",                            # no directory prefix
    "data\\follower.js": "follower",                      # windows-style separator
    "data/follower-requests-sent.js": None,
    "data/follower-requests-received.js": None,
    "data/following-requests.js": None,
    "data/smartblock-following.js": None,
    "data/unfollowed-accounts.js": None,
    "data/follower.js.bak": None,
    "data/my-follower.js": None,                          # not X's file
    "data/tweets.js": None,
}
bad = {p: (ap.classify(p), want) for p, want in cases.items() if ap.classify(p) != want}
check(f"all {len(cases)} filename cases classified correctly", not bad)
if bad:
    for p, (got, want) in bad.items(): print(f"        {p}: got {got!r}, wanted {want!r}")

print("\n[4] Stats and the analysis payload")
result = ap.analyze_archive(ARCHIVE)
s = result["stats"]
check("followers counted", s["followers"] == 3)
check("following counted", s["following"] == 5)
check("mutuals counted", s["mutuals"] == 2)
check("remaining counted", s["remaining"] == 3)
check("win rate = 2/5", s["win_rate"] == 40.0)
check("ratio = 3/5", s["ratio"] == 0.6)
check("blank handles fall back to an /i/user/ link",
      all(r["url"] == f"https://x.com/i/user/{r['account_id']}" for r in result["not_following"]))

print("\n[5] Part files merge instead of overwriting")
buf2 = io.BytesIO()
with zipfile.ZipFile(buf2, "w") as z:
    z.writestr("data/following.js", ytd("following", [entry("following", "1")]))
    z.writestr("data/following-part1.js", ytd("following", [entry("following", "2")]))
    z.writestr("data/following-part2.js", ytd("following", [entry("following", "3")]))
    z.writestr("data/follower.js", ytd("follower", [entry("follower", "1")]))
_, following2, _, _ = ap.parse_archive(buf2.getvalue())
check("all three part files merged", sorted(following2) == ["1", "2", "3"])

print("\n[6] Handles are used when the archive does supply them")
buf3 = io.BytesIO()
with zipfile.ZipFile(buf3, "w") as z:
    z.writestr("data/following.js", ytd("following", [
        {"following": {"accountId": "5", "userLink": "https://twitter.com/realhandle"}},
        {"following": {"accountId": "6", "screenName": "@fromfield"}},
    ]))
    z.writestr("data/follower.js", ytd("follower", []))
res3 = ap.analyze_archive(buf3.getvalue())
by_id = {r["account_id"]: r for r in res3["not_following"]}
check("handle read from a real profile link", by_id["5"]["username"] == "realhandle")
check("handle read from screenName, @ stripped", by_id["6"]["username"] == "fromfield")
check("profile url uses the handle", by_id["5"]["url"] == "https://x.com/realhandle")

print(f"{'='*52}\n  {ok} passed, {fail} failed\n{'='*52}")
sys.exit(1 if fail else 0)
