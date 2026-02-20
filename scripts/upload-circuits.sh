#!/bin/bash
# Upload circuit files to GitHub Release for CI/CD use
# Run once: bash scripts/upload-circuits.sh

set -e

RELEASE_TAG="circuits-v1"
FILES=(
  "circuits/build_maci/MessageProcessor_final.zkey"
  "circuits/build_maci/TallyVotes_final.zkey"
  "circuits/build_maci/MessageProcessor_js/MessageProcessor.wasm"
  "circuits/build_maci/TallyVotes_js/TallyVotes.wasm"
)

echo "Checking circuit files..."
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: $f not found"
    exit 1
  fi
  echo "  OK: $f ($(du -h "$f" | cut -f1))"
done

echo ""
echo "Creating GitHub Release: $RELEASE_TAG"
gh release create "$RELEASE_TAG" \
  --title "Circuit Files (Dev Parameters)" \
  --notes "ZK circuit files for coordinator CI/CD. Dev params: stateTreeDepth=2, batchSize=2." \
  "${FILES[@]}"

echo ""
echo "Done! Circuit files uploaded to release: $RELEASE_TAG"
