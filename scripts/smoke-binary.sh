#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

binary="${1:-$root/dist/pactiac-linux-x64}"
out_dir="$(mktemp -d /tmp/pactiac-bin-smoke.XXXXXX)"

cleanup() {
  rm -rf "$out_dir"
}
trap cleanup EXIT

if [[ ! -x "$binary" ]]; then
  echo "smoke-binary: missing executable: $binary" >&2
  exit 1
fi

export PACTIA_VENDOR_ROOT="$root/test/fixtures/packages"

"$binary" compile -w "$root/test/fixtures/workspace/relay" -o "$out_dir"

test -f "$out_dir/input/manifest.json"
test -f "$out_dir/input/product.json"

echo "smoke-binary: OK ($binary)"
