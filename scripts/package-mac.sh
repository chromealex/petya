#!/bin/bash
# The macOS download for a release (run by .github/workflows/release.yml after `scripts/build.py --mac` with
# PETYA_RELEASE_SIGN=1): Petya.app goes into Petya.dmg next to an Applications link, the image is signed with the
# same Developer ID, notarized by Apple and stapled, so it opens on any Mac without a Gatekeeper warning.
# Environment: APPLE_ID, APPLE_APP_PASSWORD (an app-specific password), APPLE_TEAM_ID.
set -euo pipefail
cd "$(dirname "$0")/.."
test -d Petya.app || { echo 'Build Petya.app first: python3 scripts/build.py --mac' >&2; exit 1; }
identity=$(codesign -dvv Petya.app 2>&1 | sed -n 's/^Authority=\(Developer ID Application:.*\)$/\1/p' | head -1)
test -n "$identity" || { echo 'Petya.app is not signed with a Developer ID' >&2; exit 1; }
stage=$(mktemp -d); trap 'rm -rf "$stage"' EXIT
ditto Petya.app "$stage/Petya.app"
ln -s /Applications "$stage/Applications"
rm -f Petya.dmg
hdiutil create -volname 'Петя' -srcfolder "$stage" -fs HFS+ -format UDZO -ov Petya.dmg
codesign --force --timestamp --sign "$identity" Petya.dmg
xcrun notarytool submit Petya.dmg --apple-id "$APPLE_ID" --password "$APPLE_APP_PASSWORD" --team-id "$APPLE_TEAM_ID" --wait --timeout 40m --output-format json | tee "$stage/notary.json"
status=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('status',''))" "$stage/notary.json")
if [ "$status" != Accepted ]; then
  id=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('id',''))" "$stage/notary.json")
  [ -n "$id" ] && xcrun notarytool log "$id" --apple-id "$APPLE_ID" --password "$APPLE_APP_PASSWORD" --team-id "$APPLE_TEAM_ID" || true
  echo "Notarization: $status" >&2; exit 1
fi
xcrun stapler staple Petya.dmg
xcrun stapler validate Petya.dmg
spctl -a -t open --context context:primary-signature -v Petya.dmg
ls -lh Petya.dmg
