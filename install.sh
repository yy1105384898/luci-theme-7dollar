#!/bin/sh
# 7Dollar — one line installer for OpenWrt
#   wget -qO- https://raw.githubusercontent.com/yy1105384898/luci-theme-7dollar/main/install.sh | sh
# Behind the GFW? put a GitHub proxy in front:
#   wget -qO- https://<proxy>/https://raw.githubusercontent.com/yy1105384898/luci-theme-7dollar/main/install.sh | PROXY=https://<proxy>/ sh

REPO=yy1105384898/luci-theme-7dollar
BRANCH=${BRANCH:-main}
P=${PROXY:-}
RAW="${P}https://raw.githubusercontent.com/$REPO/$BRANCH"
TGZ="${P}https://codeload.github.com/$REPO/tar.gz/$BRANCH"
TMP=/tmp/7dollar.$$

say()  { printf '\033[38;5;173m●\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✕ %s\033[0m\n' "$*"; rm -rf "$TMP"; exit 1; }
get()  {
	if command -v curl >/dev/null 2>&1; then
		curl --http1.1 -fsSL --connect-timeout 10 --max-time 120 --retry 2 -o "$2" "$1" && return 0
	fi
	if command -v uclient-fetch >/dev/null 2>&1; then
		uclient-fetch -q -O "$2" "$1" && return 0
	fi
	if command -v wget >/dev/null 2>&1; then
		wget -q -O "$2" "$1" && return 0
	fi
	return 1
}

[ -f /etc/openwrt_release ] || die "这不是 OpenWrt 系统 / not OpenWrt"
[ -d /usr/share/ucode/luci ] || die "需要 OpenWrt 23.05 或更新版本 (ucode LuCI) / needs OpenWrt 23.05+"
mkdir -p "$TMP" || die "无法创建临时目录"

say "7Dollar 主题安装中…"

if command -v opkg >/dev/null 2>&1; then
	get "$RAW/dist/latest.txt" "$TMP/latest" || die "下载失败，请检查网络，或设置 PROXY 后重试"
	IPK=$(head -n1 "$TMP/latest" | tr -d '\r\n ')
	say "下载 $IPK"
	get "$RAW/dist/$IPK" "$TMP/$IPK" || die "下载失败，请检查网络，或设置 PROXY 后重试"
	opkg install --force-reinstall "$TMP/$IPK" || die "opkg 安装失败"
else
	# apk based releases (OpenWrt 25.x): copy the files directly
	if ! command -v nlbw >/dev/null 2>&1; then
		apk add nlbwmon || die "nlbwmon install failed"
	fi
	say "未检测到 opkg，改用文件方式安装"
	get "$TGZ" "$TMP/src.tgz" || die "下载失败，请检查网络，或设置 PROXY 后重试"
	tar -xzf "$TMP/src.tgz" -C "$TMP" || die "解压失败"
	S=$(find "$TMP" -maxdepth 1 -type d -name 'luci-theme-7dollar*' | head -n1)
	[ -n "$S" ] || die "压缩包内容不正确"
	cp -R "$S/htdocs/." /www/
	mkdir -p /usr/share/ucode/luci && cp -R "$S/ucode/." /usr/share/ucode/luci/
	[ -f /etc/config/7dollar ] && cp /etc/config/7dollar "$TMP/keep"
	cp -R "$S/root/." /
	[ -f "$TMP/keep" ] && cp "$TMP/keep" /etc/config/7dollar
	chmod 755 /etc/uci-defaults/30_luci-theme-7dollar
	( cd /etc/uci-defaults && . ./30_luci-theme-7dollar ) && rm /etc/uci-defaults/30_luci-theme-7dollar
	/etc/init.d/rpcd reload >/dev/null 2>&1
fi

/etc/init.d/nlbwmon enable
/etc/init.d/nlbwmon start

rm -rf "$TMP" /tmp/luci-indexcache* /tmp/luci-modulecache/
say "完成！刷新浏览器里的路由器后台即可看到 7Dollar。"
say "Done! Reload the router page in your browser."
