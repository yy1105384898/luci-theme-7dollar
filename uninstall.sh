#!/bin/sh
# Remove 7Dollar and switch LuCI back to Bootstrap.
# Fork: https://github.com/yy1105384898/luci-theme-7dollar
#   wget -qO- https://raw.githubusercontent.com/yy1105384898/luci-theme-7dollar/main/uninstall.sh | sh

if command -v opkg >/dev/null 2>&1 && opkg status luci-theme-7dollar | grep -q '^Status: .* installed'; then
	opkg remove luci-theme-7dollar
else
	rm -rf /www/luci-static/7dollar /www/luci-static/resources/7dollar /www/luci-static/resources/view/7dollar \
		/usr/share/ucode/luci/template/themes/7dollar
	rm -f /www/luci-static/resources/menu-7dollar.js /usr/share/luci/menu.d/luci-theme-7dollar.json \
		/usr/share/rpcd/acl.d/luci-theme-7dollar.json /etc/uci-defaults/30_luci-theme-7dollar
	uci -q delete luci.themes.7Dollar
	[ "$(uci -q get luci.main.mediaurlbase)" = "/luci-static/7dollar" ] && uci set luci.main.mediaurlbase=/luci-static/bootstrap
	uci commit luci
	/etc/init.d/rpcd reload >/dev/null 2>&1
fi

rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
echo "7Dollar 已卸载，界面已切回 Bootstrap。设置文件 /etc/config/7dollar 保留，可手动删除。"
