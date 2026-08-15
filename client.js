window.__ModuleLoader__.load({
	id: "dsh-about-updater",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _react = require("react");
		let _primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const NS = "about-updater";
		const DEFAULT_PORT = 31201;

		const dangerBtn = {
			color: "var(--dsw-alias-danger-fg, #e5484d)",
			borderColor: "rgba(229, 77, 77, 0.35)"
		};

		const styles = {
			root: { display: "flex", flexDirection: "column", gap: "12px", width: "100%" },
			title: { fontSize: "16px", fontWeight: 500, color: "var(--dsw-alias-label-primary)", margin: 0 },
			desc: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)", lineHeight: "20px", margin: "0 0 4px 0" },
			item: { display: "grid", gridTemplateColumns: "88px auto", columnGap: "28px", rowGap: "10px", justifyItems: "start", alignItems: "center", padding: "11px 12px", borderRadius: "12px", background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-subtle, transparent)" },
			itemLabel: { fontSize: "14px", color: "var(--dsw-alias-label-primary)", paddingLeft: "14px" },
			itemValue: { fontSize: "14px", color: "var(--dsw-alias-label-secondary)" },
			status: { fontSize: "13px", color: "var(--dsw-alias-label-secondary)" },
			statusOk: { fontSize: "13px", color: "var(--dsw-alias-success-fg, #30a46c)" },
			statusNew: { fontSize: "13px", color: "var(--dsw-alias-label-primary)" },
			statusErr: { fontSize: "13px", color: "var(--dsw-alias-danger-fg, #e5484d)" },
			output: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", margin: 0, lineHeight: "18px" }
		};

		async function resolvePort(connection) {
			try {
				const response = await connection.api.settings.describe({});
				if (response?.result?.ok) {
					const found = response.result.value.namespaces.find((n) => n.ns === NS);
					if (found && found.value && typeof found.value.port === "number") return found.value.port;
				}
			} catch {}
			return DEFAULT_PORT;
		}

		function AboutSection({ connection }) {
			const [port, setPort] = _react.useState(DEFAULT_PORT);
			const [current, setCurrent] = _react.useState("");
			const [latest, setLatest] = _react.useState(null);
			const [checking, setChecking] = _react.useState(false);
			const [checked, setChecked] = _react.useState(false);
			const [hasUpdate, setHasUpdate] = _react.useState(false);
			const [error, setError] = _react.useState("");
			const [updating, setUpdating] = _react.useState(false);
			const [updated, setUpdated] = _react.useState(false);
			const [updateOutput, setUpdateOutput] = _react.useState("");
			const [restarting, setRestarting] = _react.useState(false);

			_react.useEffect(() => {
				let alive = true;
				resolvePort(connection).then((p) => {
					if (!alive) return;
					setPort(p);
					doCheck(p);
				});
				return () => { alive = false; };
			}, [connection]);

			const base = () => `http://127.0.0.1:${port}`;

			const doCheck = (p) => {
				const target = p ?? port;
				setChecking(true);
				setError("");
				setChecked(false);
				setUpdateOutput("");
				fetch(`http://127.0.0.1:${target}/check`)
					.then((r) => r.json())
					.then((data) => {
						setCurrent(data.current || "");
						setLatest(data.latest);
						setHasUpdate(Boolean(data.hasUpdate));
						if (data.error) setError(data.error);
						setChecked(true);
					})
					.catch((e) => { setError(String(e.message || e)); setChecked(true); })
					.finally(() => setChecking(false));
			};

			const doUpdate = () => {
				setUpdating(true);
				setError("");
				fetch(`${base()}/update`, { method: "POST" })
					.then((r) => r.json())
					.then((data) => {
						if (data.ok) { setUpdated(true); setUpdateOutput(data.output || ""); }
						else { setError(data.output || data.error || "更新失败"); }
					})
					.catch((e) => setError(String(e.message || e)))
					.finally(() => setUpdating(false));
			};

			const doRestart = () => {
				setRestarting(true);
				setError("");
				fetch(`${base()}/restart`, { method: "POST" }).catch(() => {});
				let tries = 0;
				const poll = setInterval(() => {
					tries += 1;
					fetch(`${base()}/check`, { method: "GET" })
						.then(() => {
							clearInterval(poll);
							location.reload();
						})
						.catch(() => {
							if (tries > 60) {
								clearInterval(poll);
								setRestarting(false);
								setError("重启超时，请手动刷新页面");
							}
						});
				}, 1500);
			};

			const button = (label, onClick, opts) =>
				_react.createElement(_primitives.Button, Object.assign({
					variant: opts?.variant || "ghost",
					size: "md",
					onClick,
					style: opts?.style
				}, opts?.disabled ? { disabled: true } : {}), label);

			const checkBtn = () =>
				button(checking ? "检查更新…" : "检查更新", () => doCheck(), { variant: "ghost", disabled: checking, style: { whiteSpace: "nowrap" } });

			const statusEl = () => {
				if (checking) return _react.createElement("span", { style: styles.status }, "正在检查…");
				if (error) return _react.createElement("span", { style: styles.statusErr }, error);
				if (hasUpdate && latest) return _react.createElement("span", { style: styles.statusNew }, `发现新版本 v${latest}`);
				return _react.createElement("span", { style: styles.statusOk }, "已是最新版本");
			};

			const actionEl = () => {
				if (checking) return null;
				if (hasUpdate && latest) {
					return button(updating ? "安装中…" : "更新", doUpdate, { variant: "primary", disabled: updating });
				}
				return button(restarting ? "正在重启…" : "立即重启", doRestart, { variant: "outline", style: dangerBtn, disabled: restarting });
			};

			return _react.createElement("div", { style: styles.root },
				_react.createElement("p", { style: styles.title }, "关于 DeepSeek Harness"),
				_react.createElement("p", { style: styles.desc }, "DeepSeek Harness（dsh）是一款开源智能体框架，架构为「万物皆插件」。"),
				_react.createElement("div", { style: styles.item },
					_react.createElement("span", { style: styles.itemLabel }, "当前版本"),
					_react.createElement("span", { style: styles.itemValue }, current ? `v${current}` : "未知"),
					_react.createElement("span", null),
					statusEl()
				),
				_react.createElement("div", { style: styles.item },
					checkBtn(),
					actionEl()
				),
				updated ? _react.createElement("div", { style: styles.item },
					_react.createElement("span", { style: styles.itemLabel }, "更新完成"),
					button("立即重启", doRestart, { variant: "outline", style: dangerBtn, disabled: restarting })
				) : null,
				updateOutput ? _react.createElement("pre", { style: styles.output }, updateOutput) : null
			);
		}

		const inject = [
			"slots",
			"locale",
			"connection"
		];

		function apply(ctx) {
			const connection = ctx.get("connection");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "about",
				order: 9999,
				label: () => "关于",
				locale: NS,
				inject: () => ({ connection })
			}, AboutSection));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});