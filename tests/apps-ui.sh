#!/usr/bin/env bash
# Runs the Electron UI tests of the app catalog and app cards one by one (each starts its own Petya window).
# Card screenshots land in the temp folder (petya-*.png); CI uploads them for a visual check.
set -uo pipefail
cd "$(dirname "$0")/.."
log=$(mktemp)
status=0
for test in tests/app-catalog-ui.cjs tests/offer-cards-ui.cjs $(ls tests/*-ui.cjs | grep -E 'tests/(regex-cron|ci-builds|pull-requests|crashes|store-reviews|calendar|build-size|localization|dependencies|disk-usage)-ui\.cjs'); do
  [ -f "$test" ] || continue
  if timeout 180 xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox "$test" >"$log" 2>&1 && grep -q "UI smoke test passed" "$log"; then
    grep -E "passed$" "$log" | grep -v "UI smoke test passed"
  else
    echo "FAILED: $test"; grep -E "Error|assert|Timeout| in: " "$log" | grep -v -E "checkSavedConnection|fetch failed|ECONNREFUSED" | head -20; status=1
  fi
done
rm -f "$log"
exit $status
