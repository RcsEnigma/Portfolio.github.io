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


def detect_and_split_suffixes(members, min_shared=2, min_word_len=3, max_suffix_words=2):
    """
    Given a raw member list (plain strings, no existing parens), finds any
    trailing PHRASE (1 to max_suffix_words words) shared by >= min_shared
    multi-word entries and rewrites those entries as "primary (suffix)".

    Longer shared phrases win over shorter ones: "Yellowstone National
    Park" / "Grand Canyon National Park" / "Zion National Park" all share
    the 2-word tail "national park", so that's what gets split off --
    yielding "yellowstone (national park)" -- rather than only ever
    checking the single last word, which would wrongly glue "national"
    onto the primary and produce the far less useful "yellowstone national
    (park)" (every one of those would then require BOTH "yellowstone" AND
    "national" together to match, instead of "yellowstone" alone).
    Entries not part of any qualifying group are left untouched.

    This is still a heuristic, not a guarantee of quality -- see the
    module docstring's note on proper-name landmarks ("Niagara Falls")
    getting split even though that's arguably wrong. Review the output
    before trusting a batch wholesale, same as any generated pack.
    """
    from collections import Counter

    handled = [False] * len(members)
    result = list(members)

    for n in range(max_suffix_words, 0, -1):
        counts = Counter()
        for i, m in enumerate(members):
            if handled[i]:
                continue
            parts = m.split()
            if len(parts) <= n:  # need at least one word left over for the primary
                continue
            suffix_words = parts[-n:]
            if n == 1 and len(suffix_words[0]) < min_word_len:
                continue  # single-word suffixes still need the length floor;
                          # multi-word phrases are self-evidently substantive
            counts[" ".join(suffix_words).lower()] += 1

        qualifying = {s for s, c in counts.items() if c >= min_shared and s not in _SKIP_SUFFIXES}
        if not qualifying:
            continue

        for i, m in enumerate(members):
            if handled[i]:
                continue
            parts = m.split()
            if len(parts) <= n:
                continue
            suffix = " ".join(parts[-n:]).lower()
            if suffix in qualifying:
                primary = " ".join(parts[:-n])
                result[i] = f"{primary} ({' '.join(parts[-n:])})"
                handled[i] = True

    return result


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


# ── English-word filter, to catch scientific-binomial-only labels ──
def load_english_wordset(path="wordnet_synonyms.json"):
    """
    Loads the flat `dictionary` word list out of wordnet_synonyms.json (the
    same file the app itself uses) into a lowercase set, for filtering out
    labels that are PURELY a scientific binomial with no English common
    name at all -- e.g. "sapeornis chaoyangensis" or "hemiscyllium henryi".
    These are real, currently-valid species; Wikidata/Wikipedia just never
    gave them an English common name, so there's nothing to "fix" about
    them upstream -- they're only useful to filter OUT here if you'd rather
    have a smaller, cleaner category than a bigger, Latin-heavier one.

    Returns None (meaning: skip this filter entirely) if the file can't be
    found, rather than erroring -- this filter is a nice-to-have, not a
    requirement, and the two parse_*.py scripts work fine without it.
    """
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    words = data.get("dictionary", [])
    if not words:
        return None
    return {w.lower() for w in words}


def looks_like_pure_binomial(label, english_words):
    """
    True if NONE of the words in `label` appear in `english_words` -- i.e.
    every word looks like it's scientific Latin, not an English common
    name. If english_words is None (dictionary not loaded), always returns
    False so nothing gets filtered.
    """
    if english_words is None:
        return False
    words = re.findall(r"[a-z]+", label.lower())
    if not words:
        return False
    return not any(w in english_words for w in words)


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
