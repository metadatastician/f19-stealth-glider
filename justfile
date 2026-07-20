# F19 Stealth Glider — task runner
# SPDX-License-Identifier: AGPL-3.0-or-later

default:
    @just --list

# Run the cited verification ledger (fails on any red).
verify:
    #!/usr/bin/env bash
    set -euo pipefail
    cd src
    for v in verify1 verify2 verify3 verify8 verify9; do
        echo "== node $v.mjs =="
        node "$v.mjs"
    done

# Rebuild the self-contained playable HTML at the repo root.
build:
    #!/usr/bin/env bash
    set -euo pipefail
    cd src
    node build.mjs
    mv -f f19-stealth-glider.html ../f19-stealth-glider.html
    echo "built ../f19-stealth-glider.html"

# Full check: ledger + rebuild + reproducibility diff.
test: verify build
    #!/usr/bin/env bash
    set -euo pipefail
    cd src && node build.mjs
    if diff -q f19-stealth-glider.html ../f19-stealth-glider.html; then
        echo "OK: bundle reproducible, ledger green"
    else
        echo "STALE: run 'just build' and commit"; exit 1
    fi
    rm -f f19-stealth-glider.html

# Run every script, including the exploratory (non-ledger) ones.
verify-all:
    #!/usr/bin/env bash
    cd src
    for v in verify1 verify2 verify3 verify4 verify5 verify6 verify7 verify8 verify9 verify10; do
        echo "== node $v.mjs =="; node "$v.mjs" || echo "[exit $? — exploratory, not a ledger claim]"
    done
