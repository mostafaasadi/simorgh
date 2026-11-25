#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

STATIC_DIR="static"
VENDOR_DIR="$STATIC_DIR/vendor"
FLAGS_DIR="$VENDOR_DIR/flags"

CHART_URL="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.js"
LUCIDE_URL="https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js"
FLAG_ICONS_VERSION="7.5.0"
FLAG_ICONS_URL="https://github.com/lipis/flag-icons/archive/refs/tags/v${FLAG_ICONS_VERSION}.zip"
FLAG_ICONS_FALLBACK_URL="https://github.com/lipis/flag-icons/archive/refs/heads/main.zip"

CHART_PATH="$VENDOR_DIR/chart.umd.js"
LUCIDE_PATH="$VENDOR_DIR/lucide.min.js"

mkdir -p "$VENDOR_DIR" "$FLAGS_DIR"

download() {
    local url="$1"
    local output="$2"

    if command -v curl >/dev/null 2>&1; then
        curl -fL --retry 3 --retry-delay 1 -o "$output" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "$output" "$url"
    elif command -v python3 >/dev/null 2>&1; then
        python3 -c 'import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])' "$url" "$output"
    else
        echo "curl, wget, or python3 is required" >&2
        exit 1
    fi
}

echo "Downloading Chart.js"
download "$CHART_URL" "$CHART_PATH"

echo "Downloading Lucide"
download "$LUCIDE_URL" "$LUCIDE_PATH"

echo "Downloading flag-icons"
FLAGS_ARCHIVE="$(mktemp)"
if ! download "$FLAG_ICONS_URL" "$FLAGS_ARCHIVE"; then
    echo "Pinned flag-icons version failed, falling back to main branch"
    download "$FLAG_ICONS_FALLBACK_URL" "$FLAGS_ARCHIVE"
fi

echo "Extracting flag SVG files"
python3 - "$FLAGS_ARCHIVE" "$FLAGS_DIR" <<'PY'
import os
import sys
import zipfile

archive_path, output_dir = sys.argv[1], sys.argv[2]
count = 0

with zipfile.ZipFile(archive_path) as archive:
    for name in archive.namelist():
        if "/flags/4x3/" not in name or not name.endswith(".svg"):
            continue
        target = os.path.join(output_dir, os.path.basename(name))
        with open(target, "wb") as handle:
            handle.write(archive.read(name))
        count += 1

print(f"Extracted {count} flag files")
if count < 200:
    print("Flag extraction looks incomplete", file=sys.stderr)
    sys.exit(1)
PY

rm -f "$FLAGS_ARCHIVE"

for file in "$CHART_PATH" "$LUCIDE_PATH"; do
    if [ ! -s "$file" ]; then
        echo "Download failed: $file" >&2
        exit 1
    fi
done

echo "All assets downloaded"
