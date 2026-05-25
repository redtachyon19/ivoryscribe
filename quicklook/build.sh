#!/usr/bin/env bash
# build.sh — Build the Ivoryscribe Mac Helper QuickLook Preview Extension.
#
# Produces a single .appex bundle that gets embedded inside Ivoryscribe.app
# at Contents/PlugIns/IvoryscribeMacHelper.appex. Embedding happens via the
# electron-builder afterSign hook in frontend/scripts/after-sign.mjs — this
# script is just responsible for compiling the Swift sources, assembling the
# bundle, and applying the sandbox entitlement that PlugInKit requires.
#
# The .appex is NEVER installed standalone. Apple's recommended pattern
# (matched by Notes, Mail, Notion, Claude, ChatGPT, etc.) is to bundle the
# extension inside the host app so it appears in /Applications as a single
# .app with no visible helper alongside it. PlugInKit discovers extensions
# by walking <app>/Contents/PlugIns at install time.
#
# Output: build/IvoryscribeMacHelper.appex (ad-hoc signed, sandboxed).

set -euo pipefail

# ── Layout ─────────────────────────────────────────────────────────────
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_EXT="$HERE/Sources/Extension"
BUILD="$HERE/build"
APPEX="$BUILD/IvoryscribeMacHelper.appex"
APPEX_CONTENTS="$APPEX/Contents"
APPEX_MACOS="$APPEX_CONTENTS/MacOS"

# ── Toolchain ──────────────────────────────────────────────────────────
SWIFTC="$(xcrun --find swiftc)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
DEPLOYMENT_TARGET="12.0"
ARCH="arm64"
TRIPLE="${ARCH}-apple-macos${DEPLOYMENT_TARGET}"

echo "[helper] swiftc:        $SWIFTC"
echo "[helper] sdk:           $SDK_PATH"
echo "[helper] triple:        $TRIPLE"

# ── Clean ──────────────────────────────────────────────────────────────
rm -rf "$BUILD"
mkdir -p "$APPEX_MACOS"

# ── Compile the extension ──────────────────────────────────────────────
# The .appex executable is a regular Mach-O binary; macOS PlugInKit dlopens
# it and reflectively instantiates NSExtensionPrincipalClass (from
# Info.plist) via the Objective-C runtime. Our PreviewProvider class is
# exported to ObjC via @objc(PreviewProvider).
#
# All three Swift files compile together as one module so they can see each
# other's types without explicit imports.
echo "[helper] compiling …"
"$SWIFTC" \
    -target "$TRIPLE" \
    -sdk "$SDK_PATH" \
    -O \
    -module-name IvoryscribeMacHelper \
    -framework Foundation \
    -framework AppKit \
    -framework QuickLookUI \
    -Xlinker -e -Xlinker _NSExtensionMain \
    -o "$APPEX_MACOS/IvoryscribeMacHelper" \
    "$SRC_EXT/TuskParser.swift" \
    "$SRC_EXT/HTMLRenderer.swift" \
    "$SRC_EXT/PreviewProvider.swift"

# ── Drop Info.plist in place ───────────────────────────────────────────
cp "$SRC_EXT/Info.plist" "$APPEX_CONTENTS/Info.plist"
plutil -convert binary1 "$APPEX_CONTENTS/Info.plist"

# Minimal PkgInfo — XPC! identifies the bundle as an app extension.
printf "XPC!????" > "$APPEX_CONTENTS/PkgInfo"

# ── Sign ───────────────────────────────────────────────────────────────
# REQUIRED entitlement: com.apple.security.app-sandbox. PlugInKit refuses
# to load non-sandboxed plugins (logs: "plug-ins must be sandboxed").
# Ad-hoc identity is fine for local installs — for distribution, swap "-"
# for "Developer ID Application: <Your Name>".
echo "[helper] ad-hoc signing (sandboxed) …"
codesign --force --sign - --timestamp=none \
    --entitlements "$SRC_EXT/Extension.entitlements" \
    "$APPEX"

# ── Verify ─────────────────────────────────────────────────────────────
echo "[helper] verifying …"
codesign --verify --verbose "$APPEX"
if codesign -d --entitlements - "$APPEX" 2>&1 | grep -q "com.apple.security.app-sandbox"; then
    echo "        ✓ sandbox entitlement present"
else
    echo "        ✗ sandbox entitlement MISSING — pluginkit will reject"
    exit 1
fi

echo ""
echo "[helper] ✅ done"
echo "         $APPEX"
echo ""
echo "This .appex is meant to be embedded inside Ivoryscribe.app/Contents/PlugIns/"
echo "by the electron-builder afterSign hook. To install it manually for testing:"
echo "  cp -R '$APPEX' /Applications/Ivoryscribe.app/Contents/PlugIns/"
echo "  codesign --force --sign - /Applications/Ivoryscribe.app"
echo ""
