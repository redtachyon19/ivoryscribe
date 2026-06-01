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
SRC_THUMB="$HERE/Sources/Thumbnail"
BUILD="$HERE/build"
# Preview extension (Spacebar panel) — HTML based.
APPEX="$BUILD/IvoryscribeMacHelper.appex"
APPEX_CONTENTS="$APPEX/Contents"
APPEX_MACOS="$APPEX_CONTENTS/MacOS"
# Thumbnail extension (Finder file icon) — Core Graphics drawing.
THUMB_APPEX="$BUILD/IvoryscribeThumbnail.appex"
THUMB_CONTENTS="$THUMB_APPEX/Contents"
THUMB_MACOS="$THUMB_CONTENTS/MacOS"

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
mkdir -p "$APPEX_MACOS" "$THUMB_MACOS"

# ── Reusable: assemble + sign an .appex ────────────────────────────────
# $1 appex contents dir, $2 plist source, $3 entitlements source, $4 appex root
finalize_appex() {
    local contents="$1" plist="$2" ents="$3" appex="$4"
    cp "$plist" "$contents/Info.plist"
    plutil -convert binary1 "$contents/Info.plist"
    # XPC! identifies the bundle as an app extension.
    printf "XPC!????" > "$contents/PkgInfo"
    # REQUIRED entitlement: com.apple.security.app-sandbox. PlugInKit refuses
    # to load non-sandboxed plugins ("plug-ins must be sandboxed"). Ad-hoc
    # identity is fine for local installs.
    codesign --force --sign - --timestamp=none --entitlements "$ents" "$appex"
    codesign --verify --verbose "$appex"
    if codesign -d --entitlements - "$appex" 2>&1 | grep -q "com.apple.security.app-sandbox"; then
        echo "        ✓ sandbox entitlement present ($(basename "$appex"))"
    else
        echo "        ✗ sandbox entitlement MISSING ($(basename "$appex")) — pluginkit will reject"
        exit 1
    fi
}

# ── 1. PREVIEW extension (Spacebar panel, HTML) ────────────────────────
# The .appex executable is a regular Mach-O binary; macOS PlugInKit dlopens
# it and reflectively instantiates NSExtensionPrincipalClass via the ObjC
# runtime (our classes are exported with @objc(...)).
# The preview DRAWS its panel (no HTML/WebKit) — an HTML QLPreviewReply makes
# QuickLook spawn a sandboxed WebKit process that can fail to launch and spin
# forever. It reuses the thumbnail's renderer (drawBookPreview /
# drawPresentationPreview live in ThumbnailRenderer.swift).
echo "[helper] compiling preview extension …"
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
    "$SRC_THUMB/ThumbnailRenderer.swift" \
    "$SRC_EXT/PreviewProvider.swift"
echo "[helper] signing preview extension …"
finalize_appex "$APPEX_CONTENTS" "$SRC_EXT/Info.plist" "$SRC_EXT/Extension.entitlements" "$APPEX"

# ── 2. THUMBNAIL extension (Finder file icon, Core Graphics) ───────────
# Reuses TuskParser.swift; draws a mini-render instead of HTML. Separate
# .appex because one bundle declares exactly one NSExtension point.
echo "[helper] compiling thumbnail extension …"
"$SWIFTC" \
    -target "$TRIPLE" \
    -sdk "$SDK_PATH" \
    -O \
    -module-name IvoryscribeThumbnail \
    -framework Foundation \
    -framework AppKit \
    -framework QuickLookThumbnailing \
    -Xlinker -e -Xlinker _NSExtensionMain \
    -o "$THUMB_MACOS/IvoryscribeThumbnail" \
    "$SRC_EXT/TuskParser.swift" \
    "$SRC_THUMB/ThumbnailRenderer.swift" \
    "$SRC_THUMB/ThumbnailProvider.swift"
echo "[helper] signing thumbnail extension …"
finalize_appex "$THUMB_CONTENTS" "$SRC_THUMB/Info.plist" "$SRC_THUMB/Thumbnail.entitlements" "$THUMB_APPEX"

echo ""
echo "[helper] ✅ done"
echo "         $APPEX"
echo "         $THUMB_APPEX"
echo ""
echo "Both .appex bundles are embedded inside Ivoryscribe.app/Contents/PlugIns/"
echo "by the electron-builder afterSign hook (frontend/scripts/after-sign.mjs)."
echo ""
