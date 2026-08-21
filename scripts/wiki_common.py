"""
Shared utilities for parse_wikidata_categories.py and
parse_wikipedia_categories.py.

Mirrors the conventions already established in index.html / claude-hypernyms.json:
  - norm(): same lowercase-alpha-only normalization as the app's norm()
  - detect_and_split_suffixes(): the automated version of the manual
    "kidney beans" -> "kidney (beans)" pass done by hand on claude-hypernyms.json.
    Given a raw member list, finds trailing words shared by >=2 entries and
    rewrites those entries into the "word (suffix)" notation the app's
    expandRawMember() already understands -- so a member like "bald eagle"
    becomes matchable as both "eagle" and "baldeagle" without any manual
    auditing pass afterward.
  - merge_into_pack(): writes/merges a category into a JSON pack file in the
    same {"Category Name": [...]} shape as the hand-curated packs, without
    clobbering categories already in the file.
  - PoliteSession: rate-limited requests.Session with the required
    descriptive User-Agent (Wikimedia/Wikidata actively reject the default
    User-Agent as of 2026 -- see module docstrings in each script) and
    automatic backoff on 429s.
"""
import json
import os
import re
import time
import unicodedata

try:
    import requests
except ImportError:
    raise SystemExit(
        "This script needs the 'requests' library. Install it with:\n"
        "    pip install requests --break-system-packages\n"
        "(or just 'pip install requests' in whatever env you run this from)"
    )


# ── normalization, matching index.html's norm()/titleCase() exactly ──
def norm(word):
    return re.sub(r"[^a-z]", "", word.lower())


def title_case(phrase):
    return " ".join(w.capitalize() for w in phrase.split())


def strip_diacritics(s):
    # Wikidata/Wikipedia labels often carry accents ("Café", "Málaga") that
    # norm() would otherwise just delete rather than transliterate, silently
    # mangling the word. Fold to closest ASCII first.
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


# ── automated version of the manual paren-splitting pass ──
_SKIP_SUFFIXES = {
    # words where splitting the suffix off destroys the meaning rather than
    # revealing a second valid one -- same exceptions made by hand for
    # "waxing crescent"/"waning gibbous" and proper-name landmarks. This
    # list is intentionally short; err on the side of splitting and let a
    # human skim the output rather than silently under-splitting.
}


def detect_and_split_suffixes(members, min_shared=2, min_word_len=3):
    """
    Given a raw member list (plain strings, no existing parens), finds any
    trailing word shared by >= min_shared multi-word entries and rewrites
    those entries as "primary (suffix)". Entries not part of a qualifying
    group are left untouched. Returns a new list, same order.

    This is a heuristic, not a guarantee of quality -- it will still split
    things like proper-name landmarks ("Niagara Falls", "Grand Canyon")
    that were deliberately left alone by hand in claude-hypernyms.json,
    because "landmark name vs. generic type" isn't something a trailing-word
    count can distinguish on its own. Review the output before trusting it,
    same as you'd review any generated pack -- this just removes the
    *mechanical* tedium of finding the repeats, not the judgment call of
    whether splitting is actually appropriate for a given category.
    """
    from collections import Counter

    trailing_count = Counter()
    for m in members:
        parts = m.split()
        if len(parts) >= 2 and len(parts[-1]) >= min_word_len:
            trailing_count[parts[-1].lower()] += 1

    qualifying = {w for w, c in trailing_count.items() if c >= min_shared and w not in _SKIP_SUFFIXES}
    if not qualifying:
        return list(members)

    out = []
    for m in members:
        parts = m.split()
        if len(parts) >= 2 and parts[-1].lower() in qualifying:
            primary = " ".join(parts[:-1])
            suffix = parts[-1]
            out.append(f"{primary} ({suffix})")
        else:
            out.append(m)
    return out


# ── pack file I/O ──
def merge_into_pack(path, category_name, members, overwrite=False):
    """
    Merges {category_name: members} into the JSON pack at `path`, creating
    the file if it doesn't exist. Refuses to clobber an existing category
    of the same name unless overwrite=True (prints a warning and skips
    instead), since a silent overwrite could quietly nuke hand-curated data.
    """
    data = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

    if category_name in data and not overwrite:
        print(f"  SKIP '{category_name}' -- already exists in {path} "
              f"({len(data[category_name])} members). Pass overwrite=True to replace.")
        return False

    data[category_name] = members
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return True


def check_collisions(category_name, other_pack_paths):
    """
    Case-insensitive check of category_name against every category name in
    other_pack_paths (a list of existing pack file paths) -- same collision
    check that's been run by hand on every batch of additions so far.
    """
    target = category_name.lower().strip()
    hits = []
    for p in other_pack_paths:
        if not os.path.exists(p):
            continue
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        for k in data:
            if k.lower().strip() == target:
                hits.append(p)
    return hits


# ── polite, rate-limited HTTP ──
class PoliteSession:
    """
    requests.Session wrapper enforcing a minimum delay between requests and
    a descriptive User-Agent. Wikimedia/Wikidata as of 2026 actively reject
    the default python-requests User-Agent outright (SPARQL queries return
    HTTP 200 with zero results, not even an error -- easy to misdiagnose as
    "the query is wrong" when it's actually the UA getting silently
    filtered), and enforce their own rate limits on top of whatever you set
    here. Fill in real contact info in USER_AGENT below before running this
    against the live APIs -- see https://meta.wikimedia.org/wiki/User-Agent_policy.
    """

    def __init__(self, user_agent, min_delay=1.0):
        if "REPLACE" in user_agent or "@" not in user_agent:
            raise SystemExit(
                "Set a real User-Agent with actual contact info before running this "
                "(see PoliteSession's docstring and USER_AGENT at the top of this script). "
                "Wikidata/Wikipedia silently reject generic ones."
            )
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent})
        self.min_delay = min_delay
        self._last_request = 0.0

    def get(self, url, params=None, max_retries=4):
        wait = self.min_delay - (time.time() - self._last_request)
        if wait > 0:
            time.sleep(wait)

        for attempt in range(max_retries):
            resp = self.session.get(url, params=params, timeout=60)
            self._last_request = time.time()
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5 * (attempt + 1)))
                print(f"  429 rate-limited, waiting {retry_after}s...")
                time.sleep(retry_after)
                continue
            resp.raise_for_status()
            return resp
        raise RuntimeError(f"Gave up after {max_retries} retries: {url}")
