"""
parse_wikidata_categories.py

Bulk-generates hypernym category packs from Wikidata's structured
instance-of (P31) / subclass-of (P279) / taxon-rank (P105+P171) claims.
This is the "depth" tool -- a single query against a broad class can return
thousands of members, vs. the handful you'd get from a live Datamuse
rel_gen call. Meant to be run occasionally, offline, same as
parse_hyponyms.py / parse_hidden_word_categories.py already are -- NOT
called live from the browser (SPARQL queries against transitive-closure
classes are slow, and Wikidata's rate limits are not friendly to
per-keystroke calls).

SETUP (required before running):
  1. pip install requests --break-system-packages
  2. Edit USER_AGENT below with a real project name + contact (Wikidata
     silently rejects generic User-Agents -- see wiki_common.PoliteSession).
  3. Edit the CATEGORIES list below -- add/remove/adjust entries. Each
     entry's "where" is a raw SPARQL WHERE-clause fragment, so you have
     full control over exactly what gets pulled. Two patterns cover most
     cases (see the starter entries for live examples of both):
       - General concepts:  ?item wdt:P31/wdt:P279* wd:QXXXX .
       - Biological taxa:   ?item wdt:P105 wd:Q7432 ;      # taxon rank = species
                                   wdt:P171* wd:QXXXX .     # parent taxon (transitive)
     Look up QIDs at https://www.wikidata.org/ (search any concept, the
     QID is in the URL) -- e.g. "cheese" is Q10943, "bird" is Q5113.

USAGE:
  python3 parse_wikidata_categories.py [--out PATH] [--dry-run]

OUTPUT:
  Writes/merges into a JSON pack file (default: wikidata-categories.json)
  in the same {"Category Name": ["member", ...]} shape as your other
  packs. Existing categories in that file are never silently overwritten
  (see wiki_common.merge_into_pack).
"""
import argparse
import sys

from wiki_common import (
    PoliteSession, check_collisions, detect_and_split_suffixes,
    merge_into_pack, norm, strip_diacritics, title_case,
)

# ── fill this in with a real project name + contact before running ──
USER_AGENT = "Aj Ambrozic word connections finder (www.ajambrozic.com/connections-finder) (ajambrozic@gmail.com)"

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"

# Existing pack files to collision-check new category names against
# (adjust paths to wherever your packs actually live).
EXISTING_PACKS = [
    "kimi-stuff.json", "gemini-lists.json", "claude-films.json",
    "kimi-HIJ.json", "gemini-HIJ2.json", "qwen-HIJ.json",
    "claude-hypernyms.json",
]

# ── category definitions -- extend this freely ──
CATEGORIES = [
    {
        "name": "Bird Species",
        "where": "?item wdt:P105 wd:Q7432 ; wdt:P171* wd:Q5113 .",  # taxon rank=species, parent taxon=Aves
        "limit": 300,
        "require_enwiki": True,
    },
    {
        "name": "Shark Species",
        "where": "?item wdt:P105 wd:Q7432 ; wdt:P171* wd:Q7372 .",  # parent taxon=Selachimorpha (verified QID)
        "limit": 200,
        "require_enwiki": True,
    },
    {
        "name": "US National Parks",
        "where": "?item wdt:P31 wd:Q34918903 .",  # instance of: National Park of the United States (verified QID)
        "limit": 100,
        "require_enwiki": True,
    },
    {
        "name": "Named Volcanoes",
        "where": "?item wdt:P31/wdt:P279* wd:Q8072 .",  # instance/subclass of: volcano
        "limit": 200,
        "require_enwiki": True,
    },
    {
        "name": "Dinosaur Genera",
        "where": "?item wdt:P105 wd:Q34740 ; wdt:P171* wd:Q430 .",  # taxon rank=genus, parent taxon=Dinosauria (verified QID)
        "limit": 200,
        # Deliberately NOT requiring an enwiki sitelink here: unlike birds,
        # most dinosaur genera (even ones known from a single tooth) DO get
        # their own Wikipedia stub, so the sitelink filter barely helps --
        # the domain itself is just mostly obscure/scientific-sounding names
        # by nature. If you want only recognizable ones (T. rex, Triceratops,
        # Stegosaurus...), a small hand-curated list will serve you better
        # than any query here.
        "require_enwiki": False,
    },
]

QUERY_TEMPLATE = """
SELECT DISTINCT ?itemLabel WHERE {{
  {where}
  {enwiki_filter}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
LIMIT {limit}
"""

# Requires the item to have an actual English Wikipedia article -- this is
# what actually fixes the "Bird Species" junk flood (obsolete 19th-century
# taxonomic synonym genera, subspecies-rank oddities, etc. are still valid
# Wikidata taxon items but essentially never get their own enwiki article,
# while any species anyone's actually heard of does).
ENWIKI_FILTER = """
  ?article schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> .
"""

# Labels that pass through Wikidata's noise filter but aren't useful as
# word-game entries: single letters/numbers, anything with digits, and
# anything absurdly long (usually means the label service fell back to a
# QID or a garbled multi-clause description instead of a clean name).
_JUNK_RE = None
import re
_JUNK_RE = re.compile(r"\d")


def clean_label(raw_label):
    label = strip_diacritics(raw_label).strip()
    if not label or _JUNK_RE.search(label):
        return None
    if len(label) > 40 or len(label.split()) > 5:
        return None
    if norm(label) == "":
        return None
    return label


def fetch_category(session, where_clause, limit, require_enwiki=True):
    query = QUERY_TEMPLATE.format(
        where=where_clause,
        enwiki_filter=(ENWIKI_FILTER if require_enwiki else ""),
        limit=limit,
    )
    resp = session.get(SPARQL_ENDPOINT, params={"query": query, "format": "json"})
    data = resp.json()
    labels = []
    seen = set()
    for row in data.get("results", {}).get("bindings", []):
        raw = row.get("itemLabel", {}).get("value", "")
        cleaned = clean_label(raw)
        if cleaned and norm(cleaned) not in seen:
            seen.add(norm(cleaned))
            labels.append(cleaned.lower())
    return labels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="wikidata-categories.json")
    ap.add_argument("--dry-run", action="store_true", help="fetch and print, don't write")
    args = ap.parse_args()

    session = PoliteSession(USER_AGENT, min_delay=1.5)

    for cat in CATEGORIES:
        name, where, limit = cat["name"], cat["where"], cat.get("limit", 200)
        print(f"Fetching '{name}'...")

        collisions = check_collisions(name, EXISTING_PACKS)
        if collisions:
            print(f"  WARNING: '{name}' already exists in {collisions} -- skipping to avoid duplicate category name.")
            continue

        try:
            members = fetch_category(session, where, limit, cat.get("require_enwiki", True))
        except Exception as e:
            print(f"  ERROR fetching '{name}': {e}")
            continue

        if len(members) < 4:
            print(f"  SKIP '{name}' -- only {len(members)} usable members after cleaning (need >=4). "
                  f"Try loosening the WHERE clause or raising the limit.")
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
