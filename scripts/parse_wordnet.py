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

def parse_file(path, pos):
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
            if len(words) >= 2:
                synsets.append((f"{pos}{offset}", words, pos))
    return synsets

all_synsets = []
for pos, fname in POS_FILES.items():
    all_synsets.extend(parse_file(f"{DICT_DIR}/{fname}", pos))

print(f"Total synsets parsed: {len(all_synsets)}", file=sys.stderr)

# Dedupe: store each synset ONCE in a lookup table, and have each word
# point at synset ids. Any two members of the same synset independently
# resolve to the identical synset id -> identical canonical categoryName
# client-side, which is what lets pair/bulk mode find the shared match
# for free via SingleWordRulePlugin's generic AND-logic, with a much
# smaller payload than repeating the member list per word.
synsets = {}   # id -> {pos, words:[...]}
word_ids = defaultdict(list)  # word -> [id, ...]

for sid, words, pos in all_synsets:
    uniq = [w for w in dict.fromkeys(words) if ' ' not in w]  # single-token only
    if len(uniq) < 2 or len(uniq) > 8:
        continue
    synsets[sid] = {"p": pos, "w": uniq}
    for w in uniq:
        word_ids[w].append(sid)

print(f"Final single-token words: {len(word_ids)}  synsets: {len(synsets)}", file=sys.stderr)

with open("wordnet_synonyms.json", "w") as f:
    json.dump({"synsets": synsets, "words": word_ids}, f, separators=(',', ':'))

import os
print(f"Output size: {os.path.getsize('wordnet_synonyms.json')/1024/1024:.2f} MB", file=sys.stderr)
