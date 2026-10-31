#!/usr/bin/env bash
# Build dist/luci-theme-7dollar_<version>_all.ipk without an OpenWrt SDK.
set -euo pipefail
cd "$(dirname "$0")/.."

VER=$(sed -n 's/^PKG_VERSION:=//p' Makefile)-r$(sed -n 's/^PKG_RELEASE:=//p' Makefile)
NAME=luci-theme-7dollar
OUT=dist/${NAME}_${VER}_all.ipk
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
export COPYFILE_DISABLE=1
TAR=tar; command -v gtar >/dev/null && TAR=gtar
own() { if $TAR --version | grep -q GNU; then echo "--format=gnu --owner=0 --group=0 --numeric-owner"; else echo "--format ustar --no-xattrs --no-mac-metadata --uid 0 --gid 0 --uname root --gname root"; fi; }

D=$TMP/data
mkdir -p "$D/www" "$D/usr/share/ucode/luci"
cp -R htdocs/. "$D/www/"
cp -R ucode/. "$D/usr/share/ucode/luci/"
cp -R root/. "$D/"
find "$D" -name .DS_Store -delete
find "$D" -type d -exec chmod 755 {} +
find "$D" -type f -exec chmod 644 {} +
chmod 755 "$D"/etc/uci-defaults/*
SIZE=$(du -sk "$D" | cut -f1)

C=$TMP/control
mkdir -p "$C"
cat > "$C/control" <<CTL
Package: $NAME
Version: $VER
Depends: libc, luci-base, nlbwmon
Source: https://github.com/yy1105384898/luci-theme-7dollar
SourceName: $NAME
License: Apache-2.0
Section: luci
URL: https://github.com/yy1105384898/luci-theme-7dollar
Maintainer: yy1105384898
Architecture: all
Installed-Size: $((SIZE * 1024))
Description: 7Dollar — an elegant, lightweight LuCI theme with five palettes,
 light/dark mode, a friendly home dashboard and grouped navigation.
CTL
echo /etc/config/7dollar > "$C/conffiles"
cat > "$C/postinst" <<'SH'
#!/bin/sh
[ "${IPKG_NO_SCRIPT}" = "1" ] && exit 0
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_postinst $0 $@
[ -n "${IPKG_INSTROOT}" ] || {
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
	/etc/init.d/rpcd reload >/dev/null 2>&1
}
exit 0
SH
cat > "$C/prerm" <<'SH'
#!/bin/sh
[ -s ${IPKG_INSTROOT}/lib/functions.sh ] || exit 0
. ${IPKG_INSTROOT}/lib/functions.sh
default_prerm $0 $@
SH
cat > "$C/postrm" <<'SH'
#!/bin/sh
[ -n "${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.7Dollar
	[ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/7dollar" ] && \
		uci -q set luci.main.mediaurlbase=/luci-static/bootstrap
	uci commit luci
	rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
}
exit 0
SH
chmod 644 "$C/control" "$C/conffiles"; chmod 755 "$C/postinst" "$C/prerm" "$C/postrm"
echo "2.0" > "$TMP/debian-binary"
( cd "$D" && $TAR $(own) -czf "$TMP/data.tar.gz" . )
( cd "$C" && $TAR $(own) -czf "$TMP/control.tar.gz" . )
mkdir -p dist
( cd "$TMP" && $TAR $(own) -czf pkg.tar.gz ./debian-binary ./data.tar.gz ./control.tar.gz )
mv "$TMP/pkg.tar.gz" "$OUT"
basename "$OUT" > dist/latest.txt
echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
