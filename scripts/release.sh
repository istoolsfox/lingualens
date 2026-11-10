#!/usr/bin/env bash
# ============================================================
# scripts/release.sh —— 发布 LinguaLens 到 toolsfox.top
# 流程：构建 → 打 zip → 上传 zip + version.json 到服务器 /downloads/
# 之后：已装用户弹窗出现"新版本可用"；本地跑 scripts/update.sh 一键更新
# 用法：bash scripts/release.sh
# ============================================================
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}"

version="$(python3 -c "import json;print(json.load(open('public/manifest.json'))['version'])")"
echo "▸ 发布版本 v${version}"

pnpm build
node scripts/zip.mjs
pnpm build:userscript

zip_path="${root}/output/lingualens-v${version}.zip"
[ -f "${zip_path}" ] || { echo "❌ 未找到产物 ${zip_path}"; exit 1; }

# /var/www/downloads 归 root——先传临时区再 sudo 挪位（ssh 已配 sudo 免密）
scp "${zip_path}" "toolsfox:/tmp/lingualens-latest.zip"
ssh toolsfox "sudo mv /tmp/lingualens-latest.zip /var/www/downloads/lingualens-latest.zip && sudo chmod 644 /var/www/downloads/lingualens-latest.zip"
printf '{"version":"%s","url":"https://toolsfox.top/downloads/lingualens-latest.zip"}\n' "${version}" \
  > "${root}/output/lingualens-version.json"
scp "${root}/output/lingualens-version.json" "toolsfox:/tmp/lingualens-version.json"
ssh toolsfox "sudo mv /tmp/lingualens-version.json /var/www/downloads/lingualens-version.json && sudo chmod 644 /var/www/downloads/lingualens-version.json"

# 油猴版（Greasy Fork/脚本猫用户可直接从固定链接安装/更新）
scp "${root}/dist-userscript/lingualens-lite.user.js" "toolsfox:/tmp/lingualens-lite.user.js"
ssh toolsfox "sudo mv /tmp/lingualens-lite.user.js /var/www/downloads/lingualens-lite.user.js && sudo chmod 644 /var/www/downloads/lingualens-lite.user.js"

echo "▸ 服务器校验："
curl -fsS "https://toolsfox.top/downloads/lingualens-version.json"
echo ""
echo "▸ 油猴脚本校验："
curl -fsS -o /dev/null -w "lingualens-lite.user.js → %{http_code}\n" "https://origin.toolsfox.top/downloads/lingualens-lite.user.js"
echo "✅ v${version} 发布完成"
