# Installed runtime dependency evidence

This inventory records the isolated ARM64 Python runtime installed from
`src/model-runtime/requirements.txt`. It does not change the training environment or
install a runtime in the application.

Run from the repository root with the installed runtime interpreter:

```sh
python tests/fixtures/petya-v1-runtime-dependencies/inventory.py \
  src/model-runtime/requirements.txt tests/fixtures/petya-v1-runtime-dependencies
```

The collector rejects version mismatches and records installed METADATA hashes,
license labels as supplied, declared license paths, and notice file byte hashes.
`SUPPLIED_NOTICES.txt` preserves the discovered UTF-8 notice texts. Discovery
includes LICENSE, LICENCE, COPYING and NOTICE filename prefixes, including
nested bundled-library notices. Regeneration was checked byte-for-byte; a
mismatched MLX pin was rejected.

All 49 installed distributions match the pins. No supplied notice files were
found in the installed sentencepiece and tokenizers distributions. Supplemental source-distribution notices are now preserved separately below;
metadata labels are not replacement license texts. This is an inventory of local package contents, not a conclusion about
license compatibility, complete upstream provenance, or redistribution rights.

## Supplemental exact-version source notices

`upstream-notices.json` records PyPI metadata/source archive URLs and archive
SHA-256 for sentencepiece 0.2.3 and tokenizers 0.23.3. Four discovered license
files were copied byte-for-byte into `upstream-notices/`, including the
SentencePiece darts_clone and libsais notices. Archives were read without
installing packages, executing build code or extracting arbitrary paths. Each
saved text has its own hash and original archive member recorded.

The original installed-wheel inventory remains unchanged and accurately reports
its missing supplied notices. The supplemental files fill the known top-level
text gaps for packaging, but do not establish wheel-to-source build provenance
or complete transitive native dependency notices. In particular, no complete
Rust dependency license inventory is claimed. The eventual runtime installer
must include the required notice bundle; it has not been packaged yet.


## Packaged notice assembly

`scripts/assemble-runtime-notices.py` verifies the currently installed runtime
against the frozen inventory, checks the original supplied notice bundle and
all supplemental file hashes, then writes
`src/model-runtime/THIRD_PARTY_NOTICES.txt`. It preserves source notice bytes
and records supplemental source URLs and hashes. Run with the isolated runtime
interpreter; `--check` fails when the packaged file or installed evidence differs.
The generated file is included by the application's existing `src/**/*` rule
and is checked byte-for-byte by the ASAR test. Git text conversion is disabled
for that file. This closes source-package omission of the collected texts;
it does not close native/Rust notice completeness, installer coverage, or
wheel-to-source provenance. No release is admitted by this assembly.
