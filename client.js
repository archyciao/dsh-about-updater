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
			changeTitle: { fontSize: "13px", fontWeight: 600, color: "var(--dsw-alias-label-primary)", margin: "0 0 6px 0" },
			changeBox: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "pre-wrap", maxHeight: "240px", overflow: "auto", margin: 0, lineHeight: "19px", padding: "10px 12px", borderRadius: "10px", background: "var(--dsw-alias-bg-layer-2)", border: "1px solid var(--dsw-alias-border-subtle, transparent)" }
		};

		function plainMarkdown(text) {
			return String(text || "")
				.replace(/<[^>]+>/g, "")
				.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
				.trim();
		}

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
			const [phase, setPhase] = _react.useState("idle"); // idle | checking | downloading | installing
			const [hasUpdate, setHasUpdate] = _react.useState(false);
			const [changelog, setChangelog] = _react.useState("");
			const [error, setError] = _react.useState("");

			_react.useEffect(() => {
				let alive = true;
				resolvePort(connection).then((p) => {
					if (!alive) return;
					setPort(p);
					doCheck(p, false);
				});
				return () => { alive = false; };
			}, [connection]);

			const base = () => `http://127.0.0.1:${port}`;

			const pollRelaunch = () => {
				let tries = 0;
				const poll = setInterval(() => {
					tries += 1;
					fetch(`${base()}/check`)
						.then(() => {
							clearInterval(poll);
							location.reload();
						})
						.catch(() => {
							if (tries > 90) {
								clearInterval(poll);
								setPhase("idle");
								setError("安装超时，请手动重启 dsh 并刷新页面");
							}
						});
				}, 2000);
			};

			const doInstall = () => {
				setPhase("installing");
				setError("");
				fetch(`${base()}/install`, { method: "POST" }).catch(() => {});
				pollRelaunch();
			};

			const startDownload = () => {
				setPhase("downloading");
				setError("");
				fetch(`${base()}/update`, { method: "POST" })
					.then((r) => r.json())
					.then((data) => {
						if (data.ok) doInstall();
						else { setPhase("idle"); setError(data.output || data.error || "下载失败"); }
					})
					.catch((e) => { setPhase("idle"); setError(String(e.message || e)); });
			};

			const doCheck = (p, auto) => {
				const target = p ?? port;
				setPhase("checking");
				setError("");
				fetch(`http://127.0.0.1:${target}/check`)
					.then((r) => r.json())
					.then((data) => {
						setCurrent(data.current || "");
						setLatest(data.latest);
						setHasUpdate(Boolean(data.hasUpdate));
						if (data.error) {
							setError(data.error);
							setPhase("idle");
							return;
						}
						setChangelog(data.hasUpdate ? plainMarkdown(data.changelog) : "");
						if (data.hasUpdate && auto) {
							startDownload();
							return;
						}
						setPhase("idle");
					})
					.catch((e) => {
						setError(String(e.message || e));
						setPhase("idle");
					});
			};

			const buttonLabel = phase === "checking" ? "检查更新…"
				: phase === "downloading" ? "正在下载…"
				: phase === "installing" ? "正在安装并重启…"
				: "检查更新";

			const statusEl = () => {
				if (error) return _react.createElement("span", { style: styles.statusErr }, error);
				if (phase === "checking") return _react.createElement("span", { style: styles.status }, "正在检查更新…");
				if (phase === "downloading") return _react.createElement("span", { style: styles.statusNew }, `正在下载 v${latest}…`);
				if (phase === "installing") return _react.createElement("span", { style: styles.statusNew }, "正在安装并重启 dsh，约需 2 分钟，请勿关闭窗口");
				if (hasUpdate && latest) return _react.createElement("span", { style: styles.statusNew }, `发现新版本 v${latest}`);
				return _react.createElement("span", { style: styles.statusOk }, "已是最新版本");
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
					_react.createElement(_primitives.Button, {
						variant: "ghost",
						size: "md",
						onClick: () => doCheck(null, true),
						disabled: phase !== "idle",
						style: { whiteSpace: "nowrap" }
					}, buttonLabel)
				),
				hasUpdate && changelog ? _react.createElement("div", null,
					_react.createElement("p", { style: styles.changeTitle }, `更新日志 v${latest}`),
					_react.createElement("pre", { style: styles.changeBox }, changelog)
				) : null
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
