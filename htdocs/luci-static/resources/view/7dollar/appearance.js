'use strict';
'require view';
'require ui';
'require 7dollar.common as td';

/* Appearance settings only affect the interface. */
const T = td.T, icon = td.icon, esc = td.esc;
const CARDS = [
	[ 'rate', T('实时速率', 'Live traffic'), T('上传和下载速度曲线', 'Upload and download chart') ],
	[ 'dev', T('在线设备', 'Online devices'), T('正在使用网络的设备', 'Devices currently online') ],
	[ 'wifi', T('设备流量', 'Device traffic'), T('每台设备的累计上传和下载', 'Upload and download totals per device') ],
	[ 'sys', T('路由器状态', 'Router status'), T('处理器、内存、温度', 'CPU, memory, temperature') ],
	[ 'actions', T('常用操作', 'Quick actions'), T('备份、软件包、诊断、日志', 'Backup, software, diagnostics, logs') ]
];
const PLUGINS = [
	[ 'openclash', 'OpenClash', 'admin/services/openclash', T('运行状态、运行模式和代理模式切换', 'Status, run mode and proxy mode switch'), true ],
	[ 'passwall', 'PassWall', 'admin/services/passwall', T('暂未适配，敬请期待', 'Not supported yet'), false ],
	[ 'homeproxy', 'HomeProxy', 'admin/services/homeproxy', T('暂未适配，敬请期待', 'Not supported yet'), false ]
];
return view.extend({
	load() { return Promise.all([ td.loadSettings(), ui.menu.load(), td.uciSection('luci', 'main') ]); },
	render([ conf, tree, luci ]) {
		this.conf = conf;
		const has = path => { let n = tree; for (const k of path.split('/')) n = n && n.children && n.children[k]; return !!n; };
		const usingUs = /\/7dollar$/.test((luci || {}).mediaurlbase || L.env.media || '');
		const pal = td.PALETTES.map(([ id, name ]) => `<button type="button" class="td-pal" data-palette="${id}" data-pick="${id}"><div class="pv"><div class="sb"><i></i><i></i><i></i><i></i></div><div class="cd"><i></i><i></i><i style="width:70%"></i><u></u></div></div><div class="nm"><span>${esc(name)}</span><span class="ck">${icon('tick')}</span></div></button>`).join('');
		const cards = CARDS.map(([ k, n, d ]) => `<div class="td-row"><div class="lb"><b>${esc(n)}</b><small>${esc(d)}</small></div><button type="button" class="td-switch" data-card="${k}" aria-label="${esc(n)}"></button></div>`).join('');
		const plugins = PLUGINS.map(([ k, n, path, d, ok ]) => {
			const found = has(path), usable = found && ok;
			const chip = found ? (ok ? `<span class="td-chip">${esc(T('已检测到', 'Detected'))}</span>` : `<span class="td-chip mute">${esc(T('已安装 · 未适配', 'Installed · unsupported'))}</span>`) : `<span class="td-chip mute">${esc(T('未安装', 'Not installed'))}</span>`;
			return `<div class="td-row${usable ? '' : ' off'}"><div class="lb"><b>${esc(n)} ${chip}</b><small>${esc(found ? d : T('安装后即可在此开启', 'Install it first to enable this card'))}</small></div><button type="button" class="td-switch" ${usable ? `data-plugin="${k}"` : 'disabled'} aria-label="${esc(n)}"></button></div>`;
		}).join('');
		const root = td.html(`<div class="td-look">
			<div class="td-head"><div><p class="td-eyebrow">${esc(T('系统', 'System'))}</p><h1 class="td-serif">${esc(T('外观与首页', 'Appearance'))}</h1><p class="td-sub">${esc(T('只影响界面显示，立即生效，不会改动网络设置。', 'Only changes how the interface looks. Applies instantly and never touches your network.'))}</p></div></div>
			${usingUs ? '' : `<div class="alert-message info"><h4>${esc(T('当前没有使用 7Dollar 主题', '7Dollar is not the active theme'))}</h4><p>${esc(T('下面的设置只在 7Dollar 主题下生效。', 'The settings below only apply to the 7Dollar theme.'))}</p><div class="right"><button type="button" class="btn primary" id="td-use">${esc(T('切换到 7Dollar', 'Use 7Dollar'))}</button></div></div>`}
			<section class="td-card td-sect"><h3 class="td-sect-t">${esc(T('配色', 'Palette'))}</h3><div class="td-palettes">${pal}</div><div class="td-row"><div class="lb"><b>${esc(T('显示模式', 'Mode'))}</b></div><div class="td-seg" id="td-modes"><button type="button" data-m="light">${esc(T('浅色', 'Light'))}</button><button type="button" data-m="dark">${esc(T('深色', 'Dark'))}</button><button type="button" data-m="auto">${esc(T('跟随系统', 'Auto'))}</button></div></div></section>
			<section class="td-card td-sect"><h3 class="td-sect-t">${esc(T('首页卡片', 'Home cards'))}</h3><p class="td-sect-d">${esc(T('“网络连接”卡片始终显示。', 'The Connection card is always shown.'))}</p><div class="td-rows">${cards}</div></section>
			<section class="td-card td-sect"><h3 class="td-sect-t">${esc(T('插件卡片', 'Plugin cards'))}</h3><div class="td-rows">${plugins}</div></section>
			<div class="td-hint">${icon('info')}<span>${esc(T('换回原主题：系统 → 通用 → 语言和界面', 'Switch back: System → General → Language and Style'))}</span></div>
		</div>`);
		this.root = root;
		root.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => this.update({ palette: b.dataset.pick })));
		root.querySelectorAll('#td-modes button').forEach(b => b.addEventListener('click', () => this.update({ mode: b.dataset.m })));
		root.querySelectorAll('[data-card]').forEach(b => b.addEventListener('click', () => { const hidden = this.hidden(), k = b.dataset.card, i = hidden.indexOf(k); i > -1 ? hidden.splice(i, 1) : hidden.push(k); this.update({ hidden_cards: hidden.join(' ') }); }));
		root.querySelectorAll('[data-plugin]').forEach(b => b.addEventListener('click', () => { const key = 'plugin_' + b.dataset.plugin; this.update({ [key]: this.conf[key] == '1' ? '0' : '1' }); }));
		const use = root.querySelector('#td-use');
		if (use) use.addEventListener('click', () => { use.disabled = true; td.uciSet('luci', 'main', { mediaurlbase: '/luci-static/7dollar' }).then(() => location.reload()).catch(e => { use.disabled = false; ui.addNotification(null, E('p', e.message)); }); });
		this.sync(); return root;
	},
	hidden() { return String(this.conf.hidden_cards || '').split(/[\s,]+/).filter(Boolean); },
	sync() {
		const c = this.conf, hidden = this.hidden();
		this.root.querySelectorAll('.td-pal').forEach(b => b.classList.toggle('on', b.dataset.pick == c.palette));
		this.root.querySelectorAll('#td-modes button').forEach(b => b.classList.toggle('on', b.dataset.m == c.mode));
		this.root.querySelectorAll('[data-card]').forEach(b => b.classList.toggle('on', hidden.indexOf(b.dataset.card) < 0));
		this.root.querySelectorAll('[data-plugin]').forEach(b => b.classList.toggle('on', c['plugin_' + b.dataset.plugin] == '1'));
	},
	update(patch) {
		Object.assign(this.conf, patch); this.sync();
		if (td.active && ('palette' in patch || 'mode' in patch)) td.applyLook(this.conf);
		const save = {}; for (const k in patch) save[k] = patch[k];
		return td.saveSettings(save).then(() => td.toast(T('已保存', 'Saved'))).catch(e => ui.addNotification(null, E('p', T('保存失败：', 'Could not save: ') + (e.message || e)), 'error'));
	},
	handleSave: null, handleSaveApply: null, handleReset: null
});
