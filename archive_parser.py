"""
archive_parser.py
=================
Reads an X (Twitter) data-archive ZIP and works out who you follow that does not
follow you back. Shared by both Python entrypoints so the logic exists once.

Why a shared module
-------------------
This code used to be copy-pasted into x_analyzer_server.py and x_follow_analyzer.py.
The two copies had already drifted, and the file-matching bug below had to be fixed
in both places, which is exactly the kind of thing that gets fixed in one copy only.

Archive shape
-------------
Entries under data/ are JS assignments rather than plain JSON:

    window.YTD.following.part0 = [ { "following": { "accountId": "...", ... } } ]

so we slice from the first "[", drop a trailing ";", and parse that. Files are
UTF-8 with a BOM, hence utf-8-sig. Large accounts split the data across part files
(following-part1.js, ...), which merge cleanly because we key on account ID.
"""

from __future__ import annotations

import io
import json
import re
import zipfile

# ---------------------------------------------------------------------------
# File classification
# ---------------------------------------------------------------------------
# The previous version asked `"follower" in path` / `"following" in path`. That is a
# substring test over the whole path, so it also matched files that merely mention
# following, and X ships several. `follower-requests-sent.js` was the one that bit us:
# its account IDs were read as real followers, so those people looked like mutuals and
# silently vanished from the not-following-back list — the tool under-reported.
#
# An allowlist of exact basenames fixes it and, unlike a blocklist, stays correct when
# X adds a new follow-adjacent export. If X ever renames these files we find nothing
# rather than the wrong thing, and the caller reports "no follower data in this
# archive", which is a loud, honest failure instead of a quiet wrong answer.
#
# Optional part suffix: follower-part1.js, following_part2.json, ...
_PART = r"(?:[-_]part\d+)?"
FOLLOWER_RE = re.compile(rf"^followers?{_PART}\.(?:js|json)$", re.I)
FOLLOWING_RE = re.compile(rf"^following{_PART}\.(?:js|json)$", re.I)
PROFILE_RE = re.compile(r"^(?:account|profile)\.(?:js|json)$", re.I)


def classify(path: str) -> str | None:
    """Return 'follower', 'following', 'profile', or None for an archive entry."""
    name = path.replace("\\", "/").rsplit("/", 1)[-1]
    if FOLLOWING_RE.match(name):
        return "following"
    if FOLLOWER_RE.match(name):
        return "follower"
    if PROFILE_RE.match(name):
        return "profile"
    return None


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------
_NON_HANDLE_SEGMENTS = {"i", "home", "intent", "search"}

# An X handle is word characters only. Validating instead of trusting whatever sat in
# the link keeps us from building a profile URL out of junk — and it is what keeps this
# function byte-identical to its JavaScript twin, which percent-encodes odd paths and
# would otherwise disagree. Real handles cap at 15; 20 leaves room for legacy oddities.
_HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,20}$")


def _handle_from_link(link) -> str:
    """
    Pull the first path segment out of a profile link.

    Deliberately hand-rolled rather than urlparse/URL: the two platforms disagree.
    JavaScript's URL normalises "x.com/../../etc/passwd" to "/etc/passwd" and hands
    back "etc", Python's urlparse does not, and URL percent-encodes paths containing
    spaces while urlparse leaves them alone. Since this module has a JS twin, the rule
    has to be explicit in both places rather than inherited from a parser.
    """
    if not isinstance(link, str) or not link:
        return ""

    rest = link
    scheme_at = rest.find("://")
    if scheme_at != -1:
        authority = rest[scheme_at + 3:]
        slash_at = authority.find("/")
        rest = authority[slash_at:] if slash_at != -1 else ""
    for separator in ("?", "#"):
        cut = rest.find(separator)
        if cut != -1:
            rest = rest[:cut]

    segments = [part for part in rest.split("/") if part]
    if not segments:
        return ""

    first = segments[0].lstrip("@")
    if first.lower() in _NON_HANDLE_SEGMENTS:
        return ""
    return first if _HANDLE_RE.match(first) else ""


def extract_username(obj) -> str:
    """
    Best-effort handle for an entry.

    Real archives usually cannot supply one: follower.js / following.js carry only an
    accountId and a userLink of the form twitter.com/intent/user?user_id=123, whose
    first path segment is "intent". So this returns "" for most genuine rows and the
    caller falls back to an /i/user/<id> link, which resolves fine in a browser.
    """
    if not isinstance(obj, dict):
        return ""

    handle = _handle_from_link(obj.get("userLink") or obj.get("profileLink") or obj.get("url"))
    if handle:
        return handle

    for key in ("screenName", "username", "userName"):
        value = obj.get(key)
        if isinstance(value, str) and value:
            candidate = value.lstrip("@")
            if _HANDLE_RE.match(candidate):
                return candidate
    return ""


def _payload(raw: str):
    """Pull the JSON array out of a `window.YTD.x.part0 = [...]` assignment."""
    start = raw.find("[")
    if start == -1:
        return None
    body = raw[start:].strip()
    if body.endswith(";"):
        body = body[:-1].strip()
    try:
        return json.loads(body)
    except ValueError:
        return None


def _account_id(obj) -> str:
    aid = obj.get("accountId") or obj.get("id")
    return str(aid) if aid else ""


# ---------------------------------------------------------------------------
# Archive reading
# ---------------------------------------------------------------------------
def parse_archive(source):
    """
    Return (followers, following, main_username, ignored).

    `source` is either the archive bytes or a path to it. The desktop app passes a
    path so a media-heavy multi-gigabyte export is never held in memory; the web
    server passes bytes because it already has the upload in hand.

    followers/following map account ID -> handle (often ""). `ignored` lists the
    follow-adjacent files we deliberately skipped, so callers can show their work
    instead of silently dropping data.
    """
    if isinstance(source, (bytes, bytearray, memoryview)):
        source = io.BytesIO(bytes(source))

    followers: dict[str, str] = {}
    following: dict[str, str] = {}
    main_username = ""
    ignored: list[str] = []

    with zipfile.ZipFile(source, "r") as archive:
        for entry in archive.namelist():
            if entry.endswith("/"):
                continue
            kind = classify(entry)
            if kind is None:
                lower = entry.lower()
                # Only report near-misses; the archive holds hundreds of unrelated files.
                if ("follow" in lower) and (lower.endswith(".js") or lower.endswith(".json")):
                    ignored.append(entry)
                continue

            try:
                raw = archive.read(entry).decode("utf-8-sig")
            except (OSError, UnicodeDecodeError, zipfile.BadZipFile):
                continue

            data = _payload(raw)
            if not isinstance(data, list):
                continue

            if kind == "profile":
                if not main_username:
                    main_username = _read_handle(data)
                continue

            for item in data:
                if not isinstance(item, dict):
                    continue
                # Trust the item's own key over the filename when it is present:
                # a part file that was named oddly still lands in the right bucket.
                if isinstance(item.get("follower"), dict):
                    bucket, obj = followers, item["follower"]
                elif isinstance(item.get("following"), dict):
                    bucket, obj = following, item["following"]
                else:
                    bucket, obj = (followers if kind == "follower" else following), item

                aid = _account_id(obj)
                if aid:
                    bucket[aid] = extract_username(obj)

    return followers, following, main_username, ignored


def _read_handle(data) -> str:
    """Dig the account owner's handle out of account.js / profile.js."""
    if not data or not isinstance(data[0], dict):
        return ""
    for wrapper, key in (("account", "username"), ("profile", "screenName")):
        section = data[0].get(wrapper)
        if isinstance(section, dict):
            value = section.get(key)
            if isinstance(value, str) and value:
                return value
    return ""


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------
def analyze(followers: dict, following: dict, main_username: str = "", ignored=None) -> dict:
    """Compare the two sets and build the payload the UIs render."""
    follower_ids = set(followers)
    following_ids = set(following)

    not_following = []
    for aid in following_ids - follower_ids:
        handle = following.get(aid, "")
        not_following.append({
            "account_id": aid,
            "username": handle,
            "url": f"https://x.com/{handle}" if handle else f"https://x.com/i/user/{aid}",
        })
    # Handles are mostly blank, so sort those to the end and order the rest by ID
    # to keep the list stable between runs.
    not_following.sort(key=lambda row: (row["username"] == "", row["username"].lower(), row["account_id"]))

    mutuals = len(following_ids & follower_ids)
    total_following = len(following_ids)

    return {
        "account_username": main_username,
        "stats": {
            "followers": len(follower_ids),
            "following": total_following,
            "remaining": len(not_following),
            "mutuals": mutuals,
            "win_rate": round(mutuals / total_following * 100, 1) if total_following else 0,
            "ratio": round(len(follower_ids) / total_following, 2) if total_following else 0,
        },
        "not_following": not_following,
        "ignored_files": list(ignored or []),
    }


def analyze_archive(source) -> dict:
    """Convenience: read an archive (bytes or path) and return the full payload."""
    followers, following, main_username, ignored = parse_archive(source)
    return analyze(followers, following, main_username, ignored)
