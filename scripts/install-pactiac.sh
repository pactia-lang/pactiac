#!/usr/bin/env bash
# Install pactiac native binary from GitHub Releases.
# Usage: curl -fsSL https://raw.githubusercontent.com/pactia-lang/pactiac/main/scripts/install-pactiac.sh | bash
#    or: ./scripts/install-pactiac.sh [version]
set -euo pipefail

repo="pactia-lang/pactiac"
version="${1:-latest}"

case "$(uname -s)" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *)
    echo "install-pactiac: unsupported OS $(uname -s)" >&2
    exit 1
    ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *)
    echo "install-pactiac: unsupported arch $(uname -m)" >&2
    exit 1
    ;;
esac

asset="pactiac-${os}-${arch}"
if [[ "$os" == "windows" ]]; then
  asset="${asset}.exe"
fi

if [[ "$version" == "latest" ]]; then
  api="https://api.github.com/repos/${repo}/releases/latest"
else
  api="https://api.github.com/repos/${repo}/releases/tags/${version}"
fi

tag="$(curl -fsSL "$api" | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "$tag" ]]; then
  echo "install-pactiac: could not resolve release version" >&2
  exit 1
fi

url="https://github.com/${repo}/releases/download/${tag}/${asset}"
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

echo "install-pactiac: downloading ${tag} ${asset}"
curl -fsSL "$url" -o "$tmpdir/pactiac"
chmod +x "$tmpdir/pactiac"

install_dir="${INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$install_dir"
install -m 755 "$tmpdir/pactiac" "$install_dir/pactiac"

echo "install-pactiac: installed to ${install_dir}/pactiac"
echo "install-pactiac: run 'pactiac compile --help' (ensure ${install_dir} is on PATH)"
