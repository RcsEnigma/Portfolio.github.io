import json, sys
from collections import defaultdict

# Reuses the dictionary we already generated in wordnet_synonyms.json --
# no need to re-parse WordNet's raw files.
with open("wordnet_synonyms.json") as f:
    DICTIONARY = json.load(f)["dictionary"]

print(f"Dictionary size: {len(DICTIONARY)}", file=sys.stderr)

# For every host word, enumerate its own substrings of length>=4 and check
# whether each substring is ALSO a real dictionary word -- if so, the host
# word is evidence for a "CONTAINS <substring>" category. This is the same
# per-word computation HiddenWordPlugin already does live in the browser,
# just run exhaustively over the whole dictionary once, offline, so the
# result can ship as a static category instead of a per-query scan.
DICT_SET = set(DICTIONARY)
hosts_of = defaultdict(set)

for host in DICTIONARY:
    if len(host) < 5 or len(host) > 20:
        continue
    seen_substrings = set()
    for i in range(len(host)):
        for j in range(i + 4, len(host) + 1):
            sub = host[i:j]
            if sub == host or sub in seen_substrings:
                continue
            seen_substrings.add(sub)
            if sub in DICT_SET:
                hosts_of[sub].add(host)

print(f"Candidate embedded words with >=1 host: {len(hosts_of)}", file=sys.stderr)

MIN_MEMBERS = 4
MAX_MEMBERS = 20
import random
random.seed(42)  # deterministic output across reruns
categories = {}
for word, hosts in hosts_of.items():
    if len(hosts) >= MIN_MEMBERS:
        hosts = list(hosts)
        # Random sample rather than shortest-first: sorting by length
        # systematically excludes longer, more recognizable words (e.g.
        # "photograph"/"autobiography" for GRAPH) once a category has
        # more candidates than MAX_MEMBERS -- any subset works equally
        # well functionally since the loop generator picks randomly from
        # whatever's stored, but a length-biased subset reads worse.
        members = random.sample(hosts, min(len(hosts), MAX_MEMBERS))
        categories[f'Contains "{word.upper()}"'] = members

print(f"Generated categories (>= {MIN_MEMBERS} members): {len(categories)}", file=sys.stderr)

with open("hidden_word_categories.json", "w") as f:
    json.dump(categories, f, separators=(',', ':'))

import os
print(f"Output size: {os.path.getsize('hidden_word_categories.json')/1024/1024:.2f} MB", file=sys.stderr)
