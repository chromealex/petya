#!/usr/bin/env bash
# Runs the Electron UI tests of the app catalog and app cards one by one (each starts its own Petya window).
# Card screenshots land in the temp folder (petya-*.png); CI uploads them for a visual check.
set -uo pipefail
cd "$(dirname "$0")/.."
log=$(mktemp)
status=0
for test in tests/app-catalog-ui.cjs tests/offer-cards-ui.cjs $(ls tests/*-ui.cjs | grep -E 'tests/(regex-cron|github-settings|ci-builds|pull-requests|crashes|store-reviews|calendar|build-size|localization|dependencies|disk-usage|app-links|meetings|meeting-apps|discord|support|sprint-planning|standup|ad-revenue|competitors|who-knows|glossary|metrics|ab-test|focus|naming|meeting-prep|patch-notes|docker|http-client|screenshot-task|converter|grafana|reminders|journal|code-review|mentor|profiler|playtest|release-checklist|anomalies|sql|search-all|google-sheets|config-balance|spreadsheet-export|document-export|meeting-hints|tone-check|file-search|logs|kubernetes|ua-campaigns|monitoring|time-tracking|subscriptions|extension-external|card-language|google-drive|absences|one-on-one|mattermost|vk-teams|retro|adr|doc-freshness|funnels|iap|chart-explain|team-me)-ui\.cjs'); do
  [ -f "$test" ] || continue
  if timeout 180 xvfb-run -a env PETYA_SMOKE_TEST=1 ./node_modules/electron/dist/electron --no-sandbox "$test" >"$log" 2>&1 && grep -q "UI smoke test passed" "$log"; then
    grep -E "passed$" "$log" | grep -v "UI smoke test passed"
  else
    echo "FAILED: $test"; grep -E "Error|assert|Timeout| in: " "$log" | grep -v -E "checkSavedConnection|fetch failed|ECONNREFUSED" | head -20; status=1
  fi
done
# The catalog in English: reports Russian text left untranslated and saves petya-catalog-en*.png.
if timeout 180 xvfb-run -a env PETYA_SMOKE_TEST=1 PETYA_INTERFACE_LANGUAGE=en ./node_modules/electron/dist/electron --no-sandbox tests/app-catalog-ui.cjs >"$log" 2>&1 && grep -q "UI smoke test passed" "$log"; then
  grep -E "passed$|Untranslated" "$log" | grep -v "UI smoke test passed"
else
  echo "FAILED: tests/app-catalog-ui.cjs (English)"; grep -E "Error|assert|Timeout| in: " "$log" | head -20; status=1
fi
rm -f "$log"
exit $status
