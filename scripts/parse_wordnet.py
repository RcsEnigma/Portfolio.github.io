import json, re, sys
from collections import defaultdict

DICT_DIR = "node_modules/wordnet-db/dict"
POS_FILES = {
    "n": "data.noun",
    "v": "data.verb",
    "a": "data.adj",
    "r": "data.adv",
}

def clean_word(w):
    # WordNet uses underscores for spaces and (p) markers for numbers sometimes
    w = w.replace('_', ' ')
    w = re.sub(r'\(.*?\)', '', w)  # strip parenthetical markers like (a), (p)
    return w.strip()

def parse_file(path, pos, all_words_out):
    synsets = []  # list of (offset, [words])
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith('  '):  # license header lines are indented
                continue
            line = line.rstrip('\n')
            if not line:
                continue
            parts = line.split()
            if len(parts) < 4:
                continue
            try:
                offset = parts[0]
                w_cnt = int(parts[3], 16)
            except ValueError:
                continue
            words = []
            idx = 4
            for i in range(w_cnt):
                word = parts[idx]
                idx += 2  # skip lex_id
                cw = clean_word(word)
                if cw and re.match(r'^[a-zA-Z][a-zA-Z \-\']*$', cw):
                    words.append(cw.lower())
            # Every word seen counts toward the "is this a real word?"
            # dictionary, EVEN from singleton synsets (w_cnt==1, no
            # synonyms) -- e.g. milk's primary sense has no synonyms but
            # is obviously still a real word. Only the synonym-CLUSTER
            # list below needs >=2 members; the dictionary itself doesn't.
            for w in words:
                if ' ' not in w:
                    all_words_out.add(w)
            if len(words) >= 2:
                synsets.append((f"{pos}{offset}", words, pos))
    return synsets

all_valid_words = set()
all_synsets = []
for pos, fname in POS_FILES.items():
    all_synsets.extend(parse_file(f"{DICT_DIR}/{fname}", pos, all_valid_words))

print(f"Total synsets parsed: {len(all_synsets)}", file=sys.stderr)

# Dedupe: store each synset ONCE in a lookup table, and have each word
# point at synset ids. Any two members of the same synset independently
# resolve to the identical synset id -> identical canonical categoryName
# client-side, which is what lets pair/bulk mode find the shared match
# for free via SingleWordRulePlugin's generic AND-logic, with a much
# smaller payload than repeating the member list per word.
synsets = {}   # id -> {pos, words:[...]}
word_ids = defaultdict(list)  # word -> [id, ...]
# all_valid_words already populated above (from parse_file, unfiltered by
# synset size) -- this answers "is X a real word", which is a different
# question from "does X have synonyms" (milk's primary sense is a
# singleton synset -- no synonyms -- but it's obviously still a real word).

for sid, words, pos in all_synsets:
    uniq = [w for w in dict.fromkeys(words) if ' ' not in w]  # single-token only
    if len(uniq) < 2 or len(uniq) > 8:
        continue
    synsets[sid] = {"p": pos, "w": uniq}
    for w in uniq:
        word_ids[w].append(sid)

print(f"Final single-token words (with synonyms): {len(word_ids)}  synsets: {len(synsets)}", file=sys.stderr)
print(f"Total valid dictionary words (incl. no-synonym singles like 'milk'): {len(all_valid_words)}", file=sys.stderr)

with open("wordnet_synonyms.json", "w") as f:
    json.dump({"synsets": synsets, "words": word_ids, "dictionary": sorted(all_valid_words)}, f, separators=(',', ':'))

import os
print(f"Output size: {os.path.getsize('wordnet_synonyms.json')/1024/1024:.2f} MB", file=sys.stderr)
