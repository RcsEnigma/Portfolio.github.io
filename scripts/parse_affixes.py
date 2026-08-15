import json, re, sys
from collections import defaultdict

DICT_DIR = "node_modules/wordnet-db/dict"
INDEX_FILES = ["index.noun", "index.verb", "index.adj", "index.adv"]

STOPWORDS = {
    # extremely common function words that make poor "puzzle" affixes —
    # they combine with almost everything, which is exactly why they're
    # useless as a category anchor (too broad to be a satisfying puzzle rule)
    'a','an','the','of','in','on','at','to','for','and','or','is','be',
    'up','out','off','not','no','de','re','un','non',
}

# WordNet encodes biological classification using fixed scaffold terms
# ("genus_mya", "division_bryophyta", "order_anura"...) which are real
# two-word lemmas but not a "compound word" pattern in any useful sense —
# they're taxonomy bookkeeping, not vocabulary. Block the ones that are
# ALWAYS taxonomy noise; words like "order"/"class"/"family" are left in
# since spot-checking shows they're mostly legitimate (order form, family
# tree) with only occasional taxonomic contamination mixed in.
TAXONOMY_SCAFFOLD = {
    'genus','division','phylum','subphylum','subgenus','superfamily',
    'subfamily','suborder','superorder','subclass','superclass','cohort',
    'tribe','subtribe','subspecies','order','class','kingdom',
}

def load_lemmas():
    lemmas = set()
    for fname in INDEX_FILES:
        with open(f"{DICT_DIR}/{fname}", encoding='utf-8', errors='ignore') as f:
            for line in f:
                if line.startswith('  '):
                    continue
                parts = line.split()
                if not parts:
                    continue
                lemmas.add(parts[0])
    return lemmas

lemmas = load_lemmas()
print(f"Total lemmas (all lengths): {len(lemmas)}", file=sys.stderr)

# Only exactly-two-word compounds ("word_word") — this is the shape your
# puzzles use ("Chain ___" = one fixed anchor + one variable word).
two_word = [l for l in lemmas if l.count('_') == 1]
print(f"Two-word compounds: {len(two_word)}", file=sys.stderr)

prefix_groups = defaultdict(set)  # anchor -> {members}  for "ANCHOR ___"
suffix_groups = defaultdict(set)  # anchor -> {members}  for "___ ANCHOR"

for l in two_word:
    a, b = l.split('_')
    if not a.isalpha() or not b.isalpha():
        continue
    if a in STOPWORDS or b in STOPWORDS:
        continue
    if a in TAXONOMY_SCAFFOLD or b in TAXONOMY_SCAFFOLD:
        continue
    if len(a) < 2 or len(b) < 2:
        continue
    prefix_groups[a].add(b)   # "a ___"  e.g. chain -> {reaction, store, mail, ...}
    suffix_groups[b].add(a)   # "___ b"  e.g. store -> {chain, ...}; but grouped by b as anchor

# Build final AFFIX_LOOKUP-shaped list: only keep anchors with enough
# members to be a usable 4+ word puzzle category, cap member list length
# for payload size, sort members by frequency-ish (shorter/common-looking
# first is a reasonable proxy without a frequency dataset).
MIN_MEMBERS = 4
MAX_MEMBERS = 20

affixes = []
for anchor, members in prefix_groups.items():
    if len(members) >= MIN_MEMBERS:
        affixes.append({
            "affix": anchor, "pos": "before", "disp": f"{anchor.upper()}___",
            "members": sorted(members, key=len)[:MAX_MEMBERS],
        })
for anchor, members in suffix_groups.items():
    if len(members) >= MIN_MEMBERS:
        affixes.append({
            "affix": anchor, "pos": "after", "disp": f"___{anchor.upper()}",
            "members": sorted(members, key=len)[:MAX_MEMBERS],
        })

print(f"Generated affix groups (compound-phrase source): {len(affixes)}", file=sys.stderr)

# ─────────────────────────────────────────────────────────────────────────
# SECOND SOURCE: fused single-word compounds ("foolproof", "waterproof",
# "firetruck") that the underscore-based scan above can't see, because
# they're stored as one token, not "word_word". For every single-token
# lemma, try every split point and check whether BOTH halves are
# themselves independently valid lemmas -- if so, it's evidence of a
# genuine fused compound, not just a coincidental substring split.
# ─────────────────────────────────────────────────────────────────────────
single_word_lemmas = {l for l in lemmas if '_' not in l and l.isalpha()}
print(f"Single-token lemmas (dictionary for fused-compound check): {len(single_word_lemmas)}", file=sys.stderr)

fused_prefix_groups = defaultdict(set)  # anchor -> {members} for "ANCHOR___" fused
fused_suffix_groups = defaultdict(set)  # anchor -> {members} for "___ANCHOR" fused

for w in single_word_lemmas:
    if len(w) < 6 or len(w) > 20:
        continue
    for i in range(3, len(w) - 2):
        head, tail = w[:i], w[i:]
        if len(head) < 3 or len(tail) < 3:
            continue
        if head in STOPWORDS or tail in STOPWORDS:
            continue
        if head in single_word_lemmas and tail in single_word_lemmas:
            # Short anchors (<4 chars) produce far more coincidental
            # collisions ("car"+"pet"="carpet" has nothing to do with
            # cars or pets) than short MEMBERS do (fire+dog=firedog is
            # a real compound even though "dog" is short) -- so gate on
            # anchor length, not member length.
            if len(head) >= 4:
                fused_prefix_groups[head].add(tail)   # head + ___  (e.g. fire + fly = firefly)
            if len(tail) >= 4:
                fused_suffix_groups[tail].add(head)   # ___ + tail  (e.g. water + proof = waterproof)

for anchor, members in fused_prefix_groups.items():
    if len(members) >= MIN_MEMBERS:
        affixes.append({
            "affix": anchor, "pos": "before", "disp": f"{anchor.upper()}___",
            "members": sorted(members, key=len)[:MAX_MEMBERS], "fused": True,
        })
for anchor, members in fused_suffix_groups.items():
    if len(members) >= MIN_MEMBERS:
        affixes.append({
            "affix": anchor, "pos": "after", "disp": f"___{anchor.upper()}",
            "members": sorted(members, key=len)[:MAX_MEMBERS], "fused": True,
        })

print(f"Generated affix groups (total, both sources, pre-merge): {len(affixes)}", file=sys.stderr)

# Merge duplicate (affix, pos) entries that got hits from both sources
# into a single combined group, unioning their members.
merged = {}
for a in affixes:
    key = (a["affix"], a["pos"])
    if key not in merged:
        merged[key] = {"affix": a["affix"], "pos": a["pos"], "disp": a["disp"], "members": set(a["members"])}
    else:
        merged[key]["members"].update(a["members"])

affixes = [
    {**v, "members": sorted(v["members"], key=len)[:MAX_MEMBERS]}
    for v in merged.values()
]
print(f"Generated affix groups (after merge): {len(affixes)}", file=sys.stderr)

with open("affix_lookup_generated.json", "w") as f:
    json.dump(affixes, f, separators=(',', ':'))

import os
print(f"Output size: {os.path.getsize('affix_lookup_generated.json')/1024:.1f} KB", file=sys.stderr)
