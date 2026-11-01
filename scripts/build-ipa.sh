#!/usr/bin/env bash
# =============================================================
# 小窝 iOS · 云端打包脚本（免签版）
#
# 不需要任何 Apple 密钥/账号/Secret —— 产出【未签名 ipa】，
# 用手机上的 eSign / 轻松签 / 爱思助手 + 你自己的证书（p12 + mobileprovision）
# 现场签名安装。
#
# 用法：bash scripts/build-ipa.sh   （GitHub Actions 自动调用）
# =============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "==> 工程根: $ROOT"

BUILD="$ROOT/build"
rm -rf "$BUILD"
mkdir -p "$BUILD"

# ---------- 1. 无签名构建 .app ----------
echo "==> xcodebuild（CODE_SIGNING_ALLOWED=NO）"
xcodebuild \
  -project Xiaowo.xcodeproj \
  -scheme Xiaowo \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$BUILD/Xiaowo.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  ARCHS="arm64" \
  archive 2>&1 | tail -25

APP=$(find "$BUILD/Xiaowo.xcarchive/Products/Applications" -name "*.app" -maxdepth 1 | head -1)
if [ -z "$APP" ]; then
  echo "!! 未找到 .app 产物"; exit 1
fi
echo "==> APP: $APP"

# 去掉签名残留（保险）
rm -rf "$APP/_CodeSignature" 2>/dev/null || true
# 移除 CodeResources 引用之外的 provisioning 文件
rm -f "$APP/embedded.mobileprovision" 2>/dev/null || true

# ---------- 2. 打成未签名 ipa（Payload 结构）----------
mkdir -p "$BUILD/ipa/Payload"
cp -R "$APP" "$BUILD/ipa/Payload/"

IPA="$BUILD/ipa/小窝-未签名.ipa"
cd "$BUILD/ipa"
zip -qry "$IPA" Payload
cd "$ROOT"

echo "==> 未签名 IPA: $IPA ($(du -h "$IPA" | cut -f1))"

# ---------- 3. 交给 Actions artifact ----------
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  mkdir -p "$ROOT/artifact"
  cp "$IPA" "$ROOT/artifact/xiaowo-unsigned.ipa"
  echo "artifact=$ROOT/artifact/xiaowo-unsigned.ipa" >> "$GITHUB_OUTPUT"
fi

# 验证结构
unzip -l "$IPA" | head -8
echo "==> 完成"
