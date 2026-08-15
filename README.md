# dsh-about-updater

DeepSeek Harness (dsh) 插件：在设置页添加「关于」面板，提供版本显示、检查更新与一键更新重启。

A dsh plugin that adds an "About" panel to the settings page, with version display, update checking, and one-click update + restart.

## 功能 / Features

- **版本显示**：展示当前安装的 dsh 版本 / Show the currently installed dsh version
- **检查更新**：查询 npm registry 是否有新版本 / Check npm registry for newer versions
- **一键更新**：检测到新版本时可直接安装 / Install updates directly when a new version is available
- **立即重启**：更新后一键重启后端（无命令窗口，自动拉起并重连）/ Restart the backend with one click after updating (no console window; auto-relaunch and reconnect)

## 界面 / UI

「关于」入口位于设置页底部导航栏。

| 当前版本 | v0.1.0-rc.6 |
|---|---|
| | 已是最新版本 |
| 检查更新 | 立即重启 |

## 安装 / Install

```bash
# 添加到 web profile
dsh plugin --profile web add <path-to-this-package>
```

安装后重启 `dsh web` 生效。Restart `dsh web` after installing.

## 实现方式 / How it works

- **host 端** (`index.js`)：内置一个迷你 HTTP 服务（默认端口 31201），提供 `/check`（查 npm registry）、`/update`（`npm install -g`）、`/restart`（延时重启后端）三个接口
- **client 端** (`client.js`)：注入设置页「关于」面板，与 host 服务通信
- 端口通过 dsh settings namespace 动态传给 client，避免硬编码冲突

## 许可 / License

MIT