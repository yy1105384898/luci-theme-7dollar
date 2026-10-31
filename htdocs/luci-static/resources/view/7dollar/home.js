'use strict';
'require view';
'require fs';
'require poll';
'require request';
'require ui';
'require 7dollar.common as td';
'require 7dollar.openbox as ob';

/* 7Dollar dashboard; plugin cards remain opt-in. */
const T = td.T, icon = td.icon, esc = td.esc;
const N = 60;
const RING = 2 * Math.PI * 24;

return view.extend({
	load() {
		if (!td.active) {
			location.replace(L.url('admin/status/overview'));
			return new Promise(() => {});
		}
		return Promise.all([
			td.loadSettings(), td.board(), td.sysinfo(), td.wan(), td.wifiInfo(), ui.menu.load(),
			td.uciType('firewall', 'defaults'), td.readFile('/sys/module/mt7915e/parameters/wed_enable'),
			td.readFile('/proc/sys/net/ipv4/tcp_congestion_control'), td.readFile('/proc/stat'), td.readFile('/proc/net/dev')
		]);
	},

	render([ conf, board, info, wan, wifi, menu, fw, wed, cc, stat, dev ]) {
		const hidden = String(conf.hidden_cards || '').split(/[\s,]+/).filter(Boolean);
		const ocNode = ((((menu.children || {}).admin || {}).children || {}).services || { children: {} }).children.openclash;
		const showOC = conf.plugin_openclash == '1' && !!ocNode;
		const services = ((((menu.children || {}).admin || {}).children || {}).services || {}).children || {};
		const showOB = !ocNode && !!services.openbox;
		this.s = {
			down: new Array(N).fill(0), up: new Array(N).fill(0),
			last: null, cpu: td.cpuStat(stat), cpuPct: null, wan: wan, wifi: wifi, info: info, board: board,
			clients: [], ping: null, oc: showOC
		};
		const fwd = Object.values(fw || {})[0] || {};
		const tags = [];
		if (fwd.flow_offloading_hw == '1') tags.push(T('硬件流量卸载', 'Hardware offload'));
		else if (fwd.flow_offloading == '1') tags.push(T('软件流量卸载', 'Software offload'));
		if (/^Y/.test(wed || '')) tags.push(T('无线加速 WED', 'Wireless offload (WED)'));
		if (/bbr/.test(cc || '')) tags.push(T('BBR 拥塞控制', 'BBR congestion control'));
		this.s.tags = tags;
		const card = (key, cls, inner) => hidden.indexOf(key) > -1 ? '' : `<section class="td-card ${cls}" data-card="${key}">${inner}</section>`;
		const os = board.release ? `${board.release.distribution} ${board.release.version}` : 'OpenWrt';
		const root = td.html(`<div class="td-home">
			<link rel="stylesheet" href="/luci-static/7dollar/traffic.css">
			<div class="td-head">
				<div><p class="td-eyebrow" id="td-today"></p><h1 class="td-serif" id="td-greet">${esc(T('你好', 'Hello'))}</h1><p class="td-sub" id="td-summary">&nbsp;</p></div>
				<a class="btn" href="${L.url('admin/system/reboot')}">${icon('refresh')}${esc(T('重启路由器', 'Reboot'))}</a>
			</div>
			<div class="td-grid${showOC || showOB ? ' has-oc' : ''}">
				<section class="td-card k-conn td-full-md" data-card="conn">
					<div class="td-card-h"><h3>${esc(T('网络连接', 'Connection'))}</h3><span class="td-chip" id="td-conn-chip"><span class="td-dot live"></span>${esc(T('畅通', 'Online'))}</span></div>
					<div class="td-topo">
						<div class="td-node" id="td-up-node"><div class="ic">${icon('modem')}</div><b>${esc(T('上级网络', 'Upstream'))}</b><small id="td-proto">—</small></div>
						<div class="td-link" id="td-link-up"><span class="t" id="td-lat">&nbsp;</span><div class="ln"><i></i><i></i></div></div>
						<div class="td-node me"><div class="ic">${icon('router')}</div><b>${esc(board.hostname || 'OpenWrt')}</b><small>${esc(T('这台路由器', 'This router'))}</small></div>
						<div class="td-link"><span class="t" id="td-lan-t">&nbsp;</span><div class="ln"><i></i><i></i></div></div>
						<div class="td-node"><div class="ic">${icon('devices')}</div><b id="td-ndev">—</b><small id="td-ndev-s">&nbsp;</small></div>
					</div>
					<dl class="td-facts">
						<div><dt>${esc(T('上网地址', 'WAN address'))}</dt><dd id="td-wanip">—</dd></div>
						<div><dt>${esc(T('网关延迟', 'Gateway latency'))}</dt><dd id="td-ping">—</dd></div>
						<div><dt>DNS</dt><dd id="td-dns">—</dd></div>
						<div><dt>${esc(T('已连接', 'Connected for'))}</dt><dd id="td-wanup">—</dd></div>
					</dl>
				</section>
				${card('rate', 'k-rate', `
					<div class="td-card-h"><h3>${esc(T('实时速率', 'Live traffic'))}</h3><span class="td-muted">${esc(T('过去 2 分钟', 'Last 2 minutes'))}</span></div>
					<div class="td-rates">
						<div class="td-rate"><small><i></i>${esc(T('下载', 'Download'))}</small><span class="td-big" id="td-down">0</span><span class="td-unit" id="td-down-u">Kbps</span></div>
						<div class="td-rate up"><small><i></i>${esc(T('上传', 'Upload'))}</small><span class="td-big" id="td-up">0</span><span class="td-unit" id="td-up-u">Kbps</span></div>
					</div><svg class="td-chart" id="td-chart" viewBox="0 0 600 118" preserveAspectRatio="none" aria-hidden="true"></svg>`)}
				${card('dev', 'k-dev td-full-md', `
					<div class="td-card-h"><h3>${esc(T('在线设备', 'Online devices'))}</h3><a href="${L.url('admin/clients')}">${esc(T('全部', 'All'))}${icon('chev')}</a></div>
					<div id="td-devs"><div class="td-empty-row">${esc(T('正在读取…', 'Loading…'))}</div></div>`)}
				${card('wifi', 'k-wifi', `
					<div class="td-card-h"><h3>${esc(T('设备流量', 'Device traffic'))}</h3><a href="${L.url('admin/clients')}">${esc(T('设备', 'Devices'))}${icon('chev')}</a></div>
					<p class="td-muted td-traffic-note">${esc(T('当前统计周期 · 按总流量排序', 'Current accounting period · sorted by total'))}</p>
					<div id="td-traffic" class="td-traffic" tabindex="0" role="region" aria-label="${esc(T('各设备流量统计', 'Traffic by device'))}"><div class="td-empty-row">${esc(T('正在读取…', 'Loading…'))}</div></div>`)}
				${showOB ? ob.card() : ''}
				${showOC ? `<section class="td-card k-proxy" data-card="oc">
					<div class="td-card-h"><h3>OpenClash</h3><span class="td-chip mute" id="td-oc-chip"><span class="td-dot"></span>${esc(T('读取中', 'Loading'))}</span></div>
					<dl class="td-kv"><div><dt>${esc(T('运行模式', 'Run mode'))}</dt><dd id="td-oc-run">—</dd></div><div><dt>${esc(T('配置文件', 'Config'))}</dt><dd id="td-oc-cfg">—</dd></div></dl>
					<div class="td-seg" id="td-oc-seg"><button type="button" data-m="rule">${esc(T('按规则', 'Rule'))}</button><button type="button" data-m="global">${esc(T('全局', 'Global'))}</button><button type="button" data-m="direct">${esc(T('直连', 'Direct'))}</button></div>
					<a class="btn block" href="${L.url('admin/services/openclash')}">${esc(T('打开 OpenClash', 'Open OpenClash'))}${icon('arrow')}</a>
				</section>` : ''}
				${card('sys', 'k-sys', `
					<div class="td-card-h"><h3>${esc(T('路由器状态', 'Router status'))}</h3><span class="td-muted">${esc(os)}</span></div>
					<div class="td-rings">${this.ring('cpu', T('处理器', 'CPU'))}${this.ring('mem', T('内存', 'Memory'))}${this.ring('temp', T('温度', 'Temperature'), 'warm')}</div><div class="td-tags" id="td-tags"></div>`)}
				${card('actions', 'k-actions', `
					<div class="td-card-h"><h3>${esc(T('常用操作', 'Quick actions'))}</h3></div><div class="td-acts">${this.act('admin/system/flash', 'backup', T('备份配置', 'Back up'))}${this.act('admin/system/package-manager', 'box', T('软件包', 'Software'))}${this.act('admin/network/diagnostics', 'pulse', T('网络诊断', 'Diagnostics'))}${this.act('admin/status/logs', 'doc', T('查看日志', 'Logs'))}</div>`)}
			</div>
		</div>`);
		this.root = root;
		this.$ = id => root.querySelector('#' + id);
		this.greet(); this.paintStatic(); this.paintWifi(wifi); this.sample(dev, info); this.refreshClients(); this.pingGateway();
		poll.add(L.bind(this.tick, this), 2);
		poll.add(L.bind(this.slow, this), 10);
		if (showOC) this.loadOC();
		if (showOB) ob.attach(root);
		requestAnimationFrame(() => requestAnimationFrame(() => this.paintRings()));
		return root;
	},

	ring(key, label, cls) {
		return `<div class="td-ring"><svg viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="24"/><circle class="fg ${cls || ''}" id="td-ring-${key}" cx="29" cy="29" r="24" style="stroke-dasharray:${RING};stroke-dashoffset:${RING}"/></svg><div><b id="td-ring-${key}-v">—</b><small id="td-ring-${key}-l">${esc(label)}</small></div></div>`;
	},
	act(path, ic, title) { return `<a class="td-act" href="${L.url(path)}">${icon(ic)}<b>${esc(title)}</b></a>`; },
	set(id, text) { const el = this.$(id); if (el && el.textContent !== String(text)) el.textContent = text; },

	greet() {
		const d = new Date(), h = d.getHours();
		const hi = T(h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好', h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
		const ok = this.s.wan && this.s.wan.up;
		this.set('td-greet', ok ? hi + T('，一切都好', ', all good') : T('网络好像断开了', 'You seem to be offline'));
		this.set('td-today', td.ZH ? `星期${'日一二三四五六'[d.getDay()]} · ${d.getMonth() + 1} 月 ${d.getDate()} 日` : d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' }));
	},

	paintStatic() {
		const w = this.s.wan;
		const PROTO = { dhcp: T('自动获取', 'DHCP'), pppoe: T('宽带拨号', 'PPPoE'), static: T('静态地址', 'Static'), dhcpv6: 'DHCPv6', qmi: T('移动网络', 'Cellular'), ncm: T('移动网络', 'Cellular'), modemmanager: T('移动网络', 'Cellular'), wwan: T('无线中继', 'Wi‑Fi uplink') };
		if (!w || !w.up) {
			this.$('td-up-node').classList.add('bad'); this.$('td-link-up').classList.add('down');
			const chip = this.$('td-conn-chip'); chip.className = 'td-chip bad';
			chip.innerHTML = `<span class="td-dot"></span>${esc(T('未连接', 'Offline'))}`;
			this.set('td-proto', T('没有连接', 'Not connected')); return;
		}
		this.set('td-proto', PROTO[w.proto] || w.proto || '—');
		this.set('td-wanip', w.ip || w.ip6 || '—'); this.set('td-dns', td.dnsName(w.dns, w.gw)); this.set('td-wanup', w.uptime ? td.duration(w.uptime) : '—');
		const tags = this.$('td-tags');
		if (tags) tags.innerHTML = this.s.tags.map(t => `<span class="td-tag">${icon('check')}${esc(t)}</span>`).join('') + `<span class="td-tag" id="td-boot">&nbsp;</span>`;
	},

	paintWifi(wifi) {
		this.s.wifi = wifi;
		const bands = [...new Set((wifi.aps || []).filter(a => a.up && a.stations.length).map(a => td.bandName(a.band)))];
		this.set('td-lan-t', bands.length ? 'Wi‑Fi ' + bands.join(' / ') : T('有线', 'Wired'));
	},

	refreshClients() {
		return td.clients(this.s.wifi).then(list => {
			this.s.allClients = list;
			const online = list.filter(c => c.online); this.s.clients = online;
			this.set('td-ndev', online.length + ' ' + T('台设备', online.length == 1 ? 'device' : 'devices'));
			this.set('td-ndev-s', online.length ? T('正在上网', 'online') : T('暂无设备', 'none yet')); this.paintSummary();
			const box = this.$('td-devs'); if (!box) return;
			const top = online.slice(0, 5);
			box.innerHTML = top.length ? top.map(c => {
				const [ sig ] = td.signal(c.signal);
				const sub = c.conn == 'wifi' ? `Wi‑Fi ${td.bandName(c.band)} · ${sig}` : T('有线连接', 'Wired') + (c.ip ? ' · ' + c.ip : '');
				const rt = c.conn == 'wifi' && c.link ? `${Math.round(c.link)} Mbps<div class="td-bar"><i style="width:${td.quality(c.signal)}%"></i></div>` : `${esc(T('有线', 'Wired'))}<div class="td-bar"><i style="width:100%"></i></div>`;
				return `<div class="td-dev"><div class="td-av">${icon(c.kind)}</div><div class="nm"><b>${esc(c.display)}</b><small>${esc(sub)}</small></div><div class="rt" title="${esc(T('连接速率 · 信号强度', 'Link rate · signal'))}">${rt}</div></div>`;
			}).join('') + (online.length > 5 ? `<a class="td-more" href="${L.url('admin/clients')}">${esc(T(`还有 ${online.length - 5} 台设备`, `${online.length - 5} more`))}</a>` : '') : `<div class="td-empty-row">${esc(T('现在没有设备在线', 'No devices online'))}</div>`;
		}).then(() => this.refreshTraffic());
	},

	refreshTraffic() {
		const box = this.$('td-traffic'); if (!box) return Promise.resolve();
		return fs.exec('/usr/sbin/nlbw', [ '-c', 'json', '-g', 'mac', '-o', 'mac' ]).then(result => {
			if (result.code !== 0) throw new Error('nlbw');
			const data = JSON.parse(result.stdout), columns = data.columns || [];
			const mi = columns.indexOf('mac'), ri = columns.indexOf('rx_bytes'), ti = columns.indexOf('tx_bytes');
			if (mi < 0 || ri < 0 || ti < 0 || !Array.isArray(data.data)) throw new Error('schema');
			const clients = {}; (this.s.allClients || []).forEach(c => { clients[c.mac.toUpperCase()] = c; });
			const rows = data.data.map(row => {
				const mac = String(row[mi] || '').toUpperCase();
				return { mac: mac, rx: Math.max(0, Number(row[ri]) || 0), tx: Math.max(0, Number(row[ti]) || 0), client: clients[mac] };
			}).filter(row => row.mac && row.mac != '00:00:00:00:00:00').sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx));
			const max = rows.length ? Math.max(1, rows[0].rx + rows[0].tx) : 1;
			box.innerHTML = rows.length ? rows.map(row => {
				const c = row.client || {};
				return `<div class="td-traffic-row"><div class="td-traffic-name"><b title="${esc(c.display || row.mac)}">${esc(c.display || row.mac)}</b><small>${esc(c.ip || row.mac)}</small></div><div class="td-traffic-values"><span title="${esc(T('下载', 'Download'))}">↓ ${esc(td.bytes(row.rx))}</span><span title="${esc(T('上传', 'Upload'))}">↑ ${esc(td.bytes(row.tx))}</span></div><div class="td-bar"><i style="width:${Math.max(1, (row.rx + row.tx) / max * 100)}%"></i></div></div>`;
			}).join('') : `<div class="td-empty-row">${esc(T('暂无统计数据', 'No traffic recorded yet'))}</div>`;
		}).catch(() => { box.innerHTML = `<div class="td-empty-row">${esc(T('暂时无法读取流量统计，请确认 nlbwmon 已安装并运行。', 'Traffic unavailable. Check that nlbwmon is installed and running.'))}</div>`; });
	},

	paintSummary() {
		const info = this.s.info || {}, n = this.s.clients.length, host = (this.s.board || {}).hostname || T('路由器', 'Router');
		if (!this.s.wan || !this.s.wan.up) { this.set('td-summary', T('上级网络没有响应，检查一下光猫或网线是否接好。', 'The upstream network is not responding. Check the modem and cables.')); return; }
		this.set('td-summary', td.ZH ? `${host} 已平稳运行 ${td.duration(info.uptime)}，${n} 台设备在线。` : `${host} has been up for ${td.duration(info.uptime)} with ${n} device${n == 1 ? '' : 's'} online.`);
	},

	sample(devText, info) {
		const now = Date.now(), w = this.s.wan, nd = td.netdev(devText), d = w && nd[w.device];
		if (info) this.s.info = info;
		if (d && this.s.last) {
			const dt = Math.max(0.5, (now - this.s.last.t) / 1000);
			const rx = Math.max(0, (d.rx - this.s.last.rx) / dt), tx = Math.max(0, (d.tx - this.s.last.tx) / dt);
			this.s.down.push(rx); this.s.down.shift(); this.s.up.push(tx); this.s.up.shift();
			const [ dv, du ] = td.rate(rx), [ uv, uu ] = td.rate(tx);
			this.set('td-down', dv); this.set('td-down-u', du); this.set('td-up', uv); this.set('td-up-u', uu); this.drawChart();
		}
		if (d) { this.s.last = { t: now, rx: d.rx, tx: d.tx }; this.set('td-boot', T(`本次开机 ↓ ${td.bytes(d.rx)} · ↑ ${td.bytes(d.tx)}`, `Since boot ↓ ${td.bytes(d.rx)} · ↑ ${td.bytes(d.tx)}`)); }
		this.paintRings();
	},

	drawChart() {
		const svg = this.$('td-chart'); if (!svg) return;
		const down = this.s.down, up = this.s.up, max = Math.max(1, ...down, ...up) * 1.15, W = 600, H = 118;
		const path = (a, close) => {
			const p = a.map((v, i) => [ i * W / (a.length - 1), H - 6 - (v / max) * (H - 22) ]); let s = `M${p[0]}`;
			for (let i = 0; i < p.length - 1; i++) { const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2; s += `C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2}`; }
			return close ? s + `L${W},${H}L0,${H}Z` : s;
		};
		svg.innerHTML = `<defs><linearGradient id="td-gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.26"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>` + `<path d="${path(down, true)}" fill="url(#td-gd)"/>` + `<path d="${path(down)}" fill="none" style="stroke:var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>` + `<path d="${path(up)}" fill="none" style="stroke:var(--second)" stroke-width="1.6" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`;
	},

	paintRings() {
		const setRing = (key, pct, text, label, cls) => {
			const c = this.$('td-ring-' + key); if (!c) return;
			c.style.strokeDashoffset = RING * (1 - Math.max(0, Math.min(100, pct || 0)) / 100);
			if (cls != null) c.setAttribute('class', 'fg ' + cls);
			this.set('td-ring-' + key + '-v', text); if (label) this.set('td-ring-' + key + '-l', label);
		};
		const info = this.s.info || {}, m = info.memory || {};
		if (this.s.cpuPct != null) setRing('cpu', this.s.cpuPct, Math.round(this.s.cpuPct) + '%');
		else if (info.load) setRing('cpu', Math.min(100, info.load[0] / 65536 * 50), (info.load[0] / 65536).toFixed(2));
		if (m.total) { const used = (m.total - (m.available || (m.free + (m.buffered || 0) + (m.cached || 0)))) / m.total * 100; setRing('mem', used, Math.round(used) + '%'); }
		if (this.s.temp != null) { const t = this.s.temp; setRing('temp', t, Math.round(t) + '°C', T('温度', 'Temp') + ' · ' + (t < 70 ? T('正常', 'normal') : t < 85 ? T('偏高', 'warm') : T('过热', 'hot')), t < 85 ? 'warm' : 'hot'); }
		else setRing('temp', 0, '—');
	},

	tick() {
		return Promise.all([ td.readFile('/proc/net/dev'), td.readFile('/proc/stat'), td.readFile('/sys/class/thermal/thermal_zone0/temp') ]).then(([ dev, stat, temp ]) => {
			const c = td.cpuStat(stat);
			if (c && this.s.cpu && c.total > this.s.cpu.total) this.s.cpuPct = 100 * (1 - (c.idle - this.s.cpu.idle) / (c.total - this.s.cpu.total));
			if (c) this.s.cpu = c; if (temp && +temp) this.s.temp = +temp / 1000; this.sample(dev);
		});
	},
	slow() {
		return Promise.all([ td.sysinfo(), td.wan(), td.wifiInfo() ]).then(([ info, wan, wifi ]) => {
			this.s.info = info; const was = this.s.wan && this.s.wan.up; this.s.wan = wan;
			if (!!(wan && wan.up) != !!was) this.greet();
			this.paintStatic(); this.paintWifi(wifi); this.pingGateway(); return this.refreshClients();
		});
	},
	pingGateway() {
		const w = this.s.wan;
		if (!w || !w.gw || !/^[0-9.]+$/.test(w.gw)) { this.set('td-lat', w && w.up ? T('已连接', 'Connected') : T('未连接', 'Offline')); return Promise.resolve(); }
		return L.resolveDefault(fs.exec('/bin/ping', [ '-c', '1', '-W', '1', w.gw ]), {}).then(r => {
			const m = String((r || {}).stdout || '').match(/time[=<]([\d.]+)/), v = m ? (+m[1] < 1 ? '<1' : Math.round(+m[1])) + ' ms' : null;
			this.set('td-ping', v || T('无响应', 'No reply')); this.set('td-lat', v ? T('延迟 ', 'Latency ') + v : T('已连接', 'Connected'));
		});
	},

	loadOC() {
		const mark = m => this.root.querySelectorAll('#td-oc-seg button').forEach(b => b.classList.toggle('on', b.dataset.m == m)); let mode = null;
		this.$('td-oc-seg').addEventListener('click', ev => {
			const b = ev.target.closest('button[data-m]'); if (!b || b.dataset.m == mode) return;
			const prev = mode; mark(mode = b.dataset.m);
			request.get(L.url('admin/services/openclash/switch_rule_mode'), { query: { rule_mode: mode } }).then(r => { if (!r.ok) throw r; td.toast(T('已切换代理模式', 'Proxy mode switched')); }).catch(() => { mark(mode = prev); td.toast(T('切换失败', 'Switch failed')); });
		});
		return Promise.all([ td.service('openclash'), td.uciSection('openclash', 'config') ]).then(([ svc, c ]) => {
			const inst = ((svc.openclash || {}).instances || {}), running = Object.keys(inst).some(k => inst[k].running), chip = this.$('td-oc-chip');
			chip.className = 'td-chip' + (running ? '' : ' mute'); chip.innerHTML = `<span class="td-dot${running ? ' live' : ''}"></span>${esc(running ? T('运行中', 'Running') : T('未运行', 'Stopped'))}`;
			const run = String(c.en_mode || c.operation_mode || ''); this.set('td-oc-run', run ? run.replace(/^fake-ip/, 'Fake-IP').replace(/^redir-host/, 'Redir-Host').replace(/-(tun|mix)$/, s => ' · ' + s.slice(1).toUpperCase()) : '—');
			const cfg = String(c.config_path || '').split('/').pop().replace(/\.ya?ml$/, ''); this.set('td-oc-cfg', cfg || '—'); this.$('td-oc-cfg').title = cfg; mark(mode = c.proxy_mode || 'rule');
		});
	},
	handleSave: null, handleSaveApply: null, handleReset: null
});
