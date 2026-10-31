'use strict';
'require baseclass';
'require rpc';
'require fs';
'require poll';
'require ui';
'require 7dollar.common as td';

const T = td.T, esc = td.esc;
const CLI = '/opt/open-box/openwrt/bin/open-box';
const UPDATE = '/opt/open-box/update.sh';
const CHANNELS = [['direct', T('GitHub 直连', 'GitHub direct')], ['https://ghfast.top', 'ghfast.top'], ['https://gh-proxy.com', 'gh-proxy.com'], ['https://gh.llkk.cc', 'gh.llkk.cc']];
const initList = rpc.declare({ object: 'luci', method: 'getInitList', params: [ 'name' ], expect: { '': {} } });
const initAction = rpc.declare({ object: 'luci', method: 'setInitAction', params: [ 'name', 'action' ], expect: { result: false } });
const serviceList = rpc.declare({ object: 'service', method: 'list', params: [ 'name' ], expect: { '': {} } });

function newer(a, b) {
	if (!b) return true;
	const parts = s => String(s).replace(/^v/, '').split(/[.-]/).slice(0, 3).map(Number);
	const x = parts(a), y = parts(b);
	for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
	return false;
}

function card() {
	return `<section class="td-card k-proxy" data-card="ob">
		<div class="td-card-h"><h3>Open-Box</h3><span class="td-chip mute" id="td-ob-status">${esc(T('读取中', 'Loading'))}</span></div>
		<dl class="td-kv"><div><dt>Open-Box</dt><dd id="td-ob-version">—</dd></div><div><dt>sing-box</dt><dd id="td-ob-core">—</dd></div></dl>
		<div class="td-row"><div class="lb"><b>${esc(T('代理内核', 'Proxy core'))}</b></div><button type="button" class="td-switch" role="switch" aria-checked="false" aria-label="${esc(T('代理内核', 'Proxy core'))}" id="td-ob-power" disabled></button></div>
		<div class="td-row"><div class="lb"><b>${esc(T('开机自启', 'Autostart'))}</b></div><button type="button" class="td-switch" role="switch" aria-checked="false" aria-label="${esc(T('开机自启', 'Autostart'))}" id="td-ob-enable" disabled></button></div>
		<div class="td-ob-actions"><button type="button" class="btn" id="td-ob-restart" disabled>${esc(T('重启内核', 'Restart core'))}</button></div>
		<p class="td-muted td-ob-message" id="td-ob-message" role="status"></p>
		<div class="td-ob-upgrade"><label for="td-ob-channel">${esc(T('升级渠道', 'Update channel'))}</label><select id="td-ob-channel">${CHANNELS.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select>
		<div class="td-ob-actions"><button type="button" class="btn" id="td-ob-probe">${esc(T('检测渠道', 'Test channels'))}</button><button type="button" class="btn" id="td-ob-check">${esc(T('检查更新', 'Check updates'))}</button></div>
		<button type="button" class="btn block" id="td-ob-update" disabled>${esc(T('立即升级', 'Upgrade now'))}</button></div>
	</section>`;
}

function attach(root) {
	const get = id => root.querySelector('#td-ob-' + id);
	if (!get('status')) return;
	let state = null, busy = false, probing = false, checking = false, upgrading = false, version = '', latest = '';
	const results = {};
	const message = text => { get('message').textContent = text; };
	const controls = () => {
		['power', 'enable', 'restart'].forEach(key => { get(key).disabled = busy || upgrading || !state; });
		['probe', 'check', 'channel'].forEach(key => { get(key).disabled = busy || upgrading || probing || checking; });
		get('update').disabled = busy || upgrading || probing || checking || !latest || latest === version;
	};
	const refresh = () => Promise.all([
		serviceList('openbox'), initList('openbox'), td.readFile('/opt/open-box/meta.json')
	]).then(([ services, init, meta ]) => {
		const entry = init.openbox;
		if (!entry) throw new Error(T('未找到 Open-Box 服务', 'Open-Box service not found'));
		const instances = ((services.openbox || {}).instances || {});
		state = { running: Object.values(instances).some(i => i.running === true), enabled: entry.enabled === true || entry.enabled === 1 };
		const chip = get('status');
		chip.className = 'td-chip' + (state.running ? '' : ' mute');
		chip.innerHTML = `<span class="td-dot${state.running ? ' live' : ''}"></span>${esc(state.running ? T('运行中', 'Running') : T('已停止', 'Stopped'))}`;
		for (const [key, on] of [['power', state.running], ['enable', state.enabled]]) {
			get(key).classList.toggle('on', on); get(key).setAttribute('aria-checked', String(on));
		}
		try {
			const data = JSON.parse(meta || '{}');
			version = data.version || '';
			get('version').textContent = version || '—'; get('core').textContent = data.singboxVersion || '—';
		} catch (e) { get('version').textContent = get('core').textContent = '—'; }
		controls();
	}).catch(e => {
		state = null; get('status').textContent = T('状态不可用', 'Status unavailable');
		message(e.message || String(e)); controls();
	});
	const action = name => initAction('openbox', name).then(ok => {
		if (!ok) throw new Error(T('服务操作失败：', 'Service action failed: ') + name);
	});
	const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
	const start = async () => {
		message(T('正在生成配置并启动内核…', 'Generating configuration and starting…'));
		let uncertain = false;
		try {
			const result = await fs.exec(CLI, ['start', '--detach']);
			if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'Start failed');
		} catch (e) {
			// A timed-out dispatch may still be running. Read status before reporting a failure.
			if (!/timeout|timed out/i.test(e.message || String(e))) throw e;
			uncertain = true;
		}
		const deadline = Date.now() + 180000;
		while (Date.now() < deadline && root.isConnected) {
			await wait(2000);
			const result = await fs.exec(CLI, ['start', '--status']);
			const text = String(result.stdout || '').trim();
			if (text === 'running' || !text) { uncertain = false; continue; }
			if (uncertain) throw new Error(T('启动结果未确认，请到 Open-Box 页面查看。', 'Start result uncertain. Check the Open-Box page.'));
			const status = JSON.parse(text);
			if (!status.ok) throw new Error(status.message || T('启动失败', 'Start failed'));
			return T('内核已启动', 'Core started');
		}
		return T('启动仍在进行，请到 Open-Box 页面查看。', 'Still starting. Check the Open-Box page.');
	};
	const run = async task => {
		if (busy || upgrading || !state) return;
		busy = true; controls();
		try { message(await task()); }
		catch (e) { message(e.message || String(e)); ui.addNotification(null, E('p', e.message || String(e)), 'error'); }
		finally { busy = false; await refresh(); }
	};
	get('power').addEventListener('click', () => run(async () => {
		if (!state.running) return start();
		await action('stop'); await action('disable');
		return T('内核已停止，开机自启已关闭', 'Core stopped and autostart disabled');
	}));
	get('enable').addEventListener('click', () => run(async () => {
		const enabled = !state.enabled; await action(enabled ? 'enable' : 'disable');
		return enabled ? T('已开启自启', 'Autostart enabled') : T('已关闭自启', 'Autostart disabled');
	}));
	get('restart').addEventListener('click', () => run(start));
	get('probe').addEventListener('click', async () => {
		if (probing || checking || upgrading || busy) return;
		probing = true; controls();
		try {
			for (let i = 0; i < CHANNELS.length; i++) {
				const [value, label] = CHANNELS[i]; message(T('正在检测 ', 'Testing ') + label);
				try {
					const r = await fs.exec(UPDATE, ['--probe', value]);
					const line = String(r.stdout || '').split('\n').find(s => s.trim().startsWith('{'));
					const result = JSON.parse(line || '{}');
					results[value] = { ok: r.code === 0 && result.ok === true, ms: Number(result.ms) || 0 };
				} catch (e) { results[value] = { ok: false }; }
				const r = results[value];
				get('channel').options[i].textContent = label + ' · ' + (r.ok ? T('可用 ', 'Available ') + r.ms + ' ms' : T('不可用', 'Unavailable'));
			}
			const reachable = CHANNELS.filter(([v]) => results[v] && results[v].ok).sort((a, b) => results[a[0]].ms - results[b[0]].ms);
			if (reachable.length) get('channel').value = reachable[0][0];
			message(reachable.length ? T('已选择最快可用渠道', 'Fastest available channel selected') : T('所有渠道均不可用，请稍后重试。', 'All channels unavailable. Try again later.'));
		} finally { probing = false; controls(); }
	});
	get('check').addEventListener('click', async () => {
		if (checking || probing || upgrading || busy) return;
		checking = true; latest = ''; controls(); message(T('正在检查更新…', 'Checking for updates…'));
		try {
			const r = await fs.exec(CLI, ['check']);
			const text = String(r.stdout || ''), match = /^latest=(v?[0-9][0-9A-Za-z._-]*)\s*$/m.exec(text);
			if (r.code !== 0 || !match) throw new Error(T('无法检查更新，请检测升级渠道后重试。', 'Could not check updates. Test channels and retry.'));
			if (/^status=latest\s*$/m.test(text) || !newer(match[1], version)) message(T('已是最新版本', 'Up to date'));
			else { latest = match[1]; message(T('发现新版：', 'New version: ') + latest); }
		} catch (e) { message(e.message || String(e)); }
		finally { checking = false; controls(); }
	});
	const readStatus = text => {
		const out = {}; String(text || '').split('\n').forEach(line => { const i = line.indexOf('='); if (i > 0) out[line.slice(0, i)] = line.slice(i + 1); }); return out;
	};
	const update = async (target, channel) => {
		if (upgrading || busy || probing || checking) return;
		upgrading = true; controls();
		const progress = E('p', {}, T('正在启动升级…', 'Starting upgrade…'));
		ui.showModal(T('Open-Box 升级', 'Open-Box upgrade'), [progress, E('div', { 'class': 'right' }, [E('button', { 'class': 'btn', 'click': () => ui.hideModal() }, T('收起', 'Hide'))])]);
		const report = text => { message(text); progress.textContent = text; };
		try {
			// Ignore stale status from earlier updates and track the detached job independently of RPC timeouts.
			const before = await td.readFile('/tmp/openbox-update.status');
			let dispatchError = null, started = false;
			const args = ['--detach'].concat(channel === 'direct' ? ['--direct'] : ['--mirror', channel], ['--expect', target]);
			fs.exec(UPDATE, args).then(r => { if (r.code !== 0) dispatchError = new Error(r.stderr || r.stdout || 'Update failed to start'); }).catch(e => { dispatchError = e; });
			const deadline = Date.now() + 600000;
			while (Date.now() < deadline && root.isConnected) {
				await wait(2000);
				const [text, meta] = await Promise.all([td.readFile('/tmp/openbox-update.status'), td.readFile('/opt/open-box/meta.json')]);
				let installed = ''; try { installed = JSON.parse(meta || '{}').version || ''; } catch (e) { /* Files may be briefly replaced during upgrade. */ }
				if (installed === target) { report(T('升级完成：', 'Upgrade complete: ') + target); latest = ''; return; }
				if (text && text !== before) started = true;
				if (started) {
					const status = readStatus(text); report(status.message || status.stage || T('正在升级…', 'Upgrading…'));
					if (/^(failed|error|cancelled)$/.test(status.stage || '')) throw new Error(status.message || T('升级失败', 'Upgrade failed'));
					if (/^(done|noop)$/.test(status.stage || '')) throw new Error(T('升级已结束，但目标版本尚未确认，请查看升级日志。', 'Update finished but target version is unconfirmed. Check the update log.'));
				} else if (dispatchError && !/timeout|timed out/i.test(dispatchError.message || '')) throw dispatchError;
			}
			report(T('暂未确认升级结果，任务可能仍在后台运行。', 'Result unconfirmed; the update may still be running.'));
		} catch (e) { report(e.message || String(e)); }
		finally { upgrading = false; await refresh(); }
	};
	get('update').addEventListener('click', () => {
		if (get('update').disabled) return;
		const target = latest, channel = get('channel').value;
		if (!CHANNELS.some(([value]) => value === channel)) return;
		if (results[channel] && !results[channel].ok) { message(T('所选渠道不可用，请切换渠道。', 'Selected channel unavailable. Choose another.')); return; }
		ui.showModal(T('确认升级 Open-Box', 'Confirm Open-Box upgrade'), [
			E('p', {}, (version || '—') + ' → ' + target),
			E('p', {}, T('升级会暂时停止服务并替换程序文件，期间网络可能短暂中断。', 'Upgrading temporarily stops services and replaces program files. Connectivity may be interrupted.')),
			E('p', {}, CHANNELS.find(([value]) => value === channel)[1]),
			E('div', { 'class': 'right' }, [E('button', { 'class': 'btn', 'click': () => ui.hideModal() }, T('取消', 'Cancel')), E('button', { 'class': 'btn primary', 'click': () => update(target, channel) }, T('立即升级', 'Upgrade now'))])
		]);
	});
	const tick = () => !root.isConnected ? Promise.resolve() : refresh();
	poll.add(tick, 10);
	return refresh();
}

return baseclass.extend({ card: card, attach: attach });
