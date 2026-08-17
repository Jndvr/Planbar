#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
version="$(node -p "require('${project_root}/manifest.json').version")"
output_dir="${1:-${project_root}/dist}"
output_file="${output_dir}/planbar-${version}-chrome-web-store.zip"
staging_dir="$(mktemp -d)"

cleanup() {
  rm -rf "${staging_dir}"
}
trap cleanup EXIT

mkdir -p "${output_dir}" "${staging_dir}/assets" "${staging_dir}/_locales/de" "${staging_dir}/_locales/en"

cp \
  "${project_root}/manifest.json" \
  "${project_root}/background.js" \
  "${project_root}/core.js" \
  "${project_root}/i18n.js" \
  "${project_root}/sidepanel.html" \
  "${project_root}/sidepanel.js" \
  "${project_root}/styles.css" \
  "${project_root}/LICENSE" \
  "${staging_dir}/"

cp "${project_root}/assets/icon-16.png" "${project_root}/assets/icon-32.png" "${project_root}/assets/icon-48.png" "${project_root}/assets/icon-128.png" "${staging_dir}/assets/"
cp "${project_root}/_locales/de/messages.json" "${staging_dir}/_locales/de/"
cp "${project_root}/_locales/en/messages.json" "${staging_dir}/_locales/en/"

rm -f "${output_file}"
(cd "${staging_dir}" && zip -q -r "${output_file}" .)

echo "Created ${output_file}"
