#!/usr/bin/env bash
# ============================================================
# scripts/update.sh —— 本地一键更新扩展（免删除重装）
# 拉服务器最新 zip 覆盖 dist/ → 扩展每分钟自检磁盘版本，
# 60 秒内自动重载生效（本地数据全部保留）
# 用法：bash scripts/update.sh
# ============================================================
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

old_v="$(python3 -c "import json;print(json.load(open('${root}/public/manifest.json'))['version'])")" \
  || old_v="未知"
echo "▸ 当前版本 v${old_v}，拉取最新…"
curl -fsS -o "${tmp}/ll.zip" "https://toolsfox.top/downloads/lingualens-latest.zip"
mkdir -p "${tmp}/unzipped"
unzip -oq "${tmp}/ll.zip" -d "${tmp}/unzipped"

# zip 根目录就是 dist 内容（manifest.json 在顶层）；稳妥起见兼容一层目录前缀
src="$(dirname "$(find "${tmp}/unzipped" -name manifest.json -maxdepth 3 | head -1)")"

rsync -a --delete "${src}/" "${root}/dist/"
new_v="$(python3 -c "import json;print(json.load(open('${root}/dist/manifest.json'))['version'])")"
echo "✅ dist 已更新到 v${new_v}"
echo "   扩展最多 1 分钟内自动重载生效（本地数据保留）；急用可到 chrome://extensions 点刷新图标"
