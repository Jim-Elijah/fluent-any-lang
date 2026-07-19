# FluentAnyLang

[English](./README.md) | **中文**

导入自己的音视频——任意语言、任意素材——按句练习听说。数据只保存在本机：无需账号，不会上传。

**[在线体验](https://fal.jimelijah.com/)** · [GitHub](https://github.com/Jim-Elijah/fluent-any-lang)

## 为什么选 FluentAnyLang？

多数语言 App 把你锁在自家课程里。FluentAnyLang 面向**已经拥有想练内容**的学习者——播客、剧集、讲座、歌曲——专注于重听、跟读与自我对照。

- **自有材料、任意语言** — 导入音视频，配套 `.srt` / `.lrc` 字幕（也可稍后补充）；支持双语字幕。
- **字幕驱动、按句练习** — 按句跳转、循环或句间暂停；口语模式的每一条录音都对齐到精确句子。
- **本地优先、注重隐私** — 媒体、录音与统计经 IndexedDB 存于浏览器；支持 ZIP 备份迁移，不会上传到服务器。
- **可安装 PWA** — 添加到主屏幕或桌面；首次访问后应用壳可离线打开。新版本会提示确认后再更新，避免打断练习。

## 功能特色

### 听力

- **自由听** — 变速、音量、上下句切换，支持快捷键。
- **抗噪听** — 可叠加最多 3 路环境噪声；可选变速阶梯，每次播完自动升速。
- **循环与暂停** — 整轨或单句循环；按固定秒数或句长百分比在句间暂停。
- **睡眠定时** — 按分钟数停止，或播完当前媒体后停止。
- **灵活播放器** — 普通、固定悬浮条、迷你三种布局，适合长时间练习。

### 口语

- **同步跟读（Sync shadowing）** — 与原音同步录音，支持倒计时提醒与实时波形。
- **回声跟读（Echo）** — 先听原句再录音；每句可保留多条录音并择优复习。
- **录音对照** — 仅原音、仅录音，或**同步播放**（按句对齐），配合波形回看。

### 媒体库与进度

- **媒体、录音与噪声库** — 搜索、排序、筛选，自定义封面与导出。
- **播放列表与收藏** — 分组整理、拖拽排序，首页可继续上次的播放列表。
- **句子库** — 从练习中收藏单句（含裁剪音频），稍后单独精练。
- **练习统计** — 有效练习时长（非墙上时钟）、连续天数、模式占比、趋势与媒体排行。

### 更多

- **界面多语言** — 简体中文、英语、日语、繁体中文。
- **备份与迁移** — ZIP 导出/导入录音、会话、句子库、播放列表、设置，媒体可选打包。

## 截图

![home-page](./docs/screenshots/home.png)
![library-page](./docs/screenshots/library.png)
![playlist-page](./docs/screenshots/playlist.png)
![sentence-bank-page](./docs/screenshots/sentence-bank.png)
![statistics-page](./docs/screenshots/statistics.png)
![settings-page](./docs/screenshots/settings.gif)

![home-import-listen](./docs/screenshots/import-and-listen.gif)
![practice-listen-advanced-setting](./docs/screenshots/listen-advanced-setting.gif)
![practive-anti-noise-listen](./docs/screenshots/anti-noise-listen.gif)
![practice-speak-shadowing](./docs/screenshots/shadowing.gif)
![practice-speak-echo](./docs/screenshots/echo.gif)
![playlist](./docs/screenshots/playlist.gif)
![sentence-bank](./docs/screenshots/sentence-bank.gif)


## 使用方式

1. 打开[在线应用](https://fal.jimelijah.com/)。
2. 导入音视频（可选字幕）。
3. 从媒体进入 **听力** 或 **口语** 练习。
4. 在统计页查看练习进度。

日常使用无需安装。口语练习建议佩戴耳机，并在提示时授予麦克风权限。也可通过浏览器菜单「安装应用」或「添加到主屏幕」以 PWA 方式使用。

## 隐私说明

FluentAnyLang 为纯前端应用。练习内容与录音保存在本地 IndexedDB。清除网站数据会删除它们；如需迁移或备份，请使用内置 ZIP 备份。

## 技术栈

Lit · Vite · TypeScript · IndexedDB（`idb`）· `@lit/localize` · PWA（Service Worker）

## 本地开发

环境要求：**Node.js 22+**、**pnpm 11+**。

```bash
pnpm install
pnpm dev
```

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `pnpm build` | 本地化构建、类型检查与生产构建 |
| `pnpm test` | 单元测试 |
| `pnpm test:e2e` | Playwright 端到端测试 |
| `pnpm lint` | ESLint |
| `pnpm localize:extract` / `pnpm localize:build` | 提取 / 构建文案 |

静态托管生产构建时，请配置 SPA 回退，使深链（`/library`、`/practice` 等）重写到 `index.html`。Service Worker（以及麦克风）需要 HTTPS。

## 许可证

[MIT](./package.json)
