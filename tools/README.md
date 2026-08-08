# tools/

## sync-banks.js

Keeps **Clarity Lite** (`lite-build/www/index.html`) and the **website genie** (`index.html`) in
step with the question banks in the genie app (`../clarity-genie`).

```bash
node tools/sync-banks.js            # check: report drift, exit 1 if any
node tools/sync-banks.js --write    # apply the genie's text to every tracked entry
```

Add `--genie <path>` if `clarity-genie` is not the sibling directory.

### Why

Three surfaces hold three copies of the same banks in three different data shapes. Kept in step by
hand they drift silently — a bank gains a question in the app, and the other two fall behind with
nothing to notice it. Run the check before any release.

### What it does and doesn't touch

| | |
|---|---|
| **Syncs** | question text, for entries listed in `LITE_MAP` / `WEB_MAP` |
| **Never touches** | labels, emoji, icons, names, blurbs, tags, intros |

Metadata is editorial and differs per surface on purpose, so **adding a new tile is still a hand
edit**. The script's job there is to *tell you* a bank hasn't reached a surface — that's the part
that used to get forgotten.

### The three maps

- **`LITE_MAP`** — every Lite mood → the genie bank it mirrors.
- **`WEB_MAP`** — website keys that carry genie text verbatim and must stay in step.
- **`WEB_BESPOKE`** — website entries deliberately reworded for a public audience, or website-only
  concepts with no genie bank. Listed explicitly so "not synced" is a recorded decision, not an
  oversight. A website key in neither map gets reported so it can't sit in limbo.

`GENIE_ONLY_BANKS` lists banks that intentionally never reach a public surface (reachable in the
app only through a feeling's weighted lane rotation), so the "unsurfaced bank" report stays honest.

### Reading the banks

`bank.ts` is **compiled with esbuild** and the real exported array read out of it. A regex scrape
was tried first and silently dropped questions — it found 8 of 11 `want` and 3 of 7 `journal`,
because it can't handle every string form in the file. **If you change how banks are read,
compile; don't pattern-match.**

esbuild is resolved from `clarity-genie/node_modules` — this repo has no `package.json`.

### After a write

The script re-reads and re-parses both files and re-compares every tracked entry, and fails loudly
(exit 2) rather than leaving a half-applied edit. The website's questions arrays are replaced in
place with a string-aware scanner, so a `]` or an escaped quote inside question text can't
terminate the array early.
