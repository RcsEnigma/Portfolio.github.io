"""
parse_wikipedia_categories.py

Bulk-generates hypernym category packs by listing article titles inside a
given Wikipedia category (action=query&list=categorymembers). Lower effort
than the Wikidata SPARQL script -- no query language, just a category
title -- at the cost of noisier results: Wikipedia categories mix actual
member articles with subcategories, "List of..." pages, disambiguation
pages, and occasional off-topic pages, all of which this script tries to
filter but won't catch perfectly. Good for quick coverage of a domain;
spot-check the output before trusting it wholesale, same as any generated
pack.

SETUP (required before running):
  1. pip install requests --break-system-packages
  2. Edit USER_AGENT below with a real project name + contact (Wikimedia
     enforces its User-Agent policy -- see wiki_common.PoliteSession).
  3. Edit the CATEGORIES list below.  Find a category by browsing to any
     Wikipedia article in the target domain and looking at the categories
     listed at the bottom of the page, or by going straight to
     https://en.wikipedia.org/wiki/Category:X and checking it's the right
     scope -- some category trees are much broader/narrower than their name
     suggests (e.g. Category:Birds is mostly subcategories, not species --
     you likely want a more specific leaf category, or recurse_subcats).

USAGE:
  python3 parse_wikipedia_categories.py [--out PATH] [--dry-run]

OUTPUT:
  Writes/merges into a JSON pack file (default: wikipedia-categories.json)
  in the same {"Category Name": ["member", ...]} shape as your other
  packs. Existing categories in that file are never silently overwritten.
"""
import argparse
import re

from wiki_common import (
    PoliteSession, check_collisions, detect_and_split_suffixes,
    merge_into_pack, norm, strip_diacritics,
)

# ── fill this in with a real project name + contact before running ──
USER_AGENT = "Aj Ambrozic word connections finder (www.ajambrozic.com/connections-finder) (ajambrozic@gmail.com)"

API_ENDPOINT = "https://en.wikipedia.org/w/api.php"

EXISTING_PACKS = [
    "kimi-stuff.json", "gemini-lists.json", "claude-films.json",
    "kimi-HIJ.json", "gemini-HIJ2.json", "qwen-HIJ.json",
    "claude-hypernyms.json",
]

# ── category definitions -- extend this freely ──
CATEGORIES = [
    {"name": "Cheese Varieties", "wiki_category": "Category:Cheeses by country", "limit": 200, "recurse_subcats": True},
    {"name": "Cocktails", "wiki_category": "Category:Cocktails", "limit": 200, "recurse_subcats": False},
    {"name": "Board Game Titles", "wiki_category": "Category:Board games", "limit": 150, "recurse_subcats": False},
    # was "Category:Classical-era composers" -- that page doesn't exist;
    # the real title is "Classical-period composers" (verified).
    {"name": "Classical Composers", "wiki_category": "Category:Classical-period composers", "limit": 150, "recurse_subcats": False},
]

_DISAMBIG_PAREN = re.compile(r"\s*\([^()]*\)\s*$")  # Wikipedia's own disambiguator, e.g. "Robin (bird)"
_JUNK_TITLE = re.compile(
    r"^(list of|lists of|index of|outline of|glossary of|timeline of|comparison of|history of)\b"
    r"|(museum|association|federation|company|companies|group|festival|dairy|markets?|"
    r"development|players|society|institute|foundation)\b"
    r"|\bin [a-z]+$",  # "Cheese in Kenya" -- a country-overview article, not a specific item
    re.IGNORECASE,
)


def clean_title(title):
    if ":" in title:  # namespace page (Category:, Template:, etc.) or a subcat slipping through
        return None
    if "/" in title:  # subpage
        return None
    if _JUNK_TITLE.search(title):
        return None
    # strip Wikipedia's own disambiguation suffix -- "Robin (bird)" -> "Robin".
    # This is deliberately DIFFERENT from the app's "word (suffix)" notation:
    # Wikipedia's parens mean "this specific sense of the word", not "optionally
    # include this qualifier", so keeping them as-is would create a nonsense
    # match key. Dropping them lets "Robin" naturally coexist with whatever
    # other categories already use that word -- which is the more useful
    # outcome anyway (see the polysemy-bridge work).
    title = _DISAMBIG_PAREN.sub("", title).strip()
    title = strip_diacritics(title)
    if not title or len(title) > 40 or len(title.split()) > 5:
        return None
    if norm(title) == "":
        return None
    return title.lower()


def fetch_categorymembers(session, wiki_category, limit, recurse_subcats):
    members = []
    seen = set()
    queue = [wiki_category]
    visited_cats = set()

    while queue and len(members) < limit:
        current = queue.pop(0)
        if current in visited_cats:
            continue
        visited_cats.add(current)

        cmcontinue = None
        while len(members) < limit:
            params = {
                "action": "query", "format": "json",
                "list": "categorymembers", "cmtitle": current,
                "cmlimit": "500", "cmtype": "page|subcat",
            }
            if cmcontinue:
                params["cmcontinue"] = cmcontinue

            resp = session.get(API_ENDPOINT, params=params)
            data = resp.json()
            for page in data.get("query", {}).get("categorymembers", []):
                title = page["title"]
                if title.startswith("Category:"):
                    if recurse_subcats:
                        queue.append(title)
                    continue
                cleaned = clean_title(title)
                if cleaned and norm(cleaned) not in seen:
                    seen.add(norm(cleaned))
                    members.append(cleaned)
                if len(members) >= limit:
                    break

            cmcontinue = data.get("continue", {}).get("cmcontinue")
            if not cmcontinue:
                break

    return members


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wikipedia-categories.json")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    session = PoliteSession(USER_AGENT, min_delay=1.0)

    for cat in CATEGORIES:
        name = cat["name"]
        print(f"Fetching '{name}' from {cat['wiki_category']}...")

        collisions = check_collisions(name, EXISTING_PACKS)
        if collisions:
            print(f"  WARNING: '{name}' already exists in {collisions} -- skipping.")
            continue

        try:
            members = fetch_categorymembers(
                session, cat["wiki_category"], cat.get("limit", 200), cat.get("recurse_subcats", False)
            )
        except Exception as e:
            print(f"  ERROR fetching '{name}': {e}")
            continue

        if len(members) < 4:
            print(f"  SKIP '{name}' -- only {len(members)} usable members after cleaning (need >=4).")
            continue

        members = detect_and_split_suffixes(members)
        print(f"  {len(members)} members. First 10: {members[:10]}")

        if not args.dry_run:
            merge_into_pack(args.out, name, members)

    if args.dry_run:
        print("\n--dry-run set, nothing written.")
    else:
        print(f"\nDone. Add {args.out!r} to packs.json to load it in the app.")


if __name__ == "__main__":
    main()
