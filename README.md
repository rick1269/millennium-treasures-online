# 拍卖大亨·基础款 v2.3.1

3–6 人在线文物拍卖桌游。可用账号或游客进入房间，先旁观再选座；房主可在空位安排机器人并决定开局时间。围桌界面显示头像，支持文字聊天与按住录制的语音消息。按终稿规则进行 2N 轮拍卖、红卡产金、拍卖行出售和私下交易。

手机端的“桌面”直接展示明拍卡牌、领先价、玩家状态和底部出价；藏品页显示套组缺口，交流以抽屉展开，房间信息在页头。真人轮到操作后有 90 秒倒计时，超时按玩家选择自动托管或竞拍放弃，可随后接管。

- [在线游戏](https://rick1269.github.io/millennium-treasures-online/)
- [图文用户手册](https://rick1269.github.io/millennium-treasures-online/manual.html)
- [本地 Markdown 手册](docs/03-小白说明书.md)
- [重新绘制的流程图](web/auction-flow-v2-revised.png)
- [三人局 UI 与产品设计确认稿（PDF）](output/pdf/拍卖大亨_三人局_UI与产品设计确认稿.pdf)
- [确认稿可编辑源文件](docs/06-三人局UI与产品设计确认稿.md)

## 本地运行

```bash
npm install
npm start
```

打开 `http://localhost:8787`。本地存档位于 `web/data/rooms.json`；v1 房间不兼容 v2.0，需要新建。

## Git 版本与切换

本仓库同时保存 GitHub Pages 根目录的已发布网页、`web/` 前端源码、`supabase/functions/` 云函数、`supabase/migrations/` 数据库迁移、`package.json` 与 `package-lock.json`、构建和测试脚本。`assets/v1.1.0/` 保存上线所需的卡面；构建时会核对归档 SHA-256。个人密钥、房间存档、`node_modules/`、原始分层插画和印刷素材不进入公开仓库。

从 `source-baseline-v2.3.1` 完整源码基线开始，Git 标签对应前后端同一份源码。查看旧版用 `git switch --detach <标签>`；要基于旧版继续修改，用 `git switch -c <新分支> <标签>`。执行 `npm ci`、`npm test` 和 `npm run build:cloud` 可复现该标签的网页。重新部署时还要用对应标签的 `npm run deploy:game` 更新 Supabase 云函数，并核对数据库迁移状态。数据库迁移不能通过 `git switch` 自动撤销；已有房间也可能与旧版规则不兼容。早于完整源码基线的 `v2.3.1` 等标签仅保存网页构建物。

Codex 每次提交均遵循[版本发布操作要求](docs/07-版本发布操作要求.md)：先完成本地检查和提交，再按 **数据库迁移 → 云函数 → 网页 → 线上验证** 发布，最后为该提交创建附注标签，记录完整 SHA、已应用迁移编号及验证结果。前三份 SQL 的线上结构和 CLI 迁移历史已于 2026-09-26 核对并对齐，后续发布仍要逐次复查。发布用的 `cloud-public.json` 从 `cloud-public.example.json` 本地创建，不提交到 Git。
GitHub Actions 会在每次推送后从全新检出的仓库运行 `npm ci`、测试和网页构建，检查源码与锁文件是否足以复现发布物。

## 验证与构建

```bash
npm test
npm run build:cloud
npm run docs:check
```

`web/game.js` 是规则引擎，`web/app.js` 是交互页面；测试覆盖牌数守恒、盲标、明暗拍、三次同价重拍、禁拍、红卡、交易、机器人整局、旁观入席、文字与语音消息、云端身份。`scripts/sync-cloud-game.js` 将规则引擎同步至 Supabase Edge Function。`scripts/build-cloud-site.js` 生成 GitHub Pages 静态站点，包括用户手册与流程图。

规则或 UI 改动时同步修订三人局图文确认稿，再运行 `npm run docs:product` 重截界面并生成 PDF。只改文稿时运行 `npm run docs:product:pdf`。`npm test` 会检查图文稿与当前源码、截图是否一致。

## 云端架构

静态页面由 GitHub Pages 托管；Supabase Auth 负责账号，Edge Function 负责规则与身份校验，Postgres 存储房间。详见 [云端部署文档](docs/05-云端部署与账号对战.md)。公开配置只含 Supabase publishable key；服务端密钥不可写入网页或仓库。
