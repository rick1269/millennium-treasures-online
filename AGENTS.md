# 项目文档同步规则

本工程的规则、游戏设定或 UI 有任何改动时，同步更新 `docs/06-三人局UI与产品设计确认稿.md` 中受影响的三人场景、步骤和产品确认项，重新生成 `docs/product-spec-assets/` 的真实界面截图与 `output/pdf/拍卖大亨_三人局_UI与产品设计确认稿.pdf`。在交付代码改动前运行 `npm run docs:product`、`npm test` 和 `npm run build:cloud`；如果只改文字或排版，运行 `npm run docs:product:pdf` 与 `npm run docs:check`。新增功能应扩充场景清单，过时描述应同步修正。

PDF 的可编辑源稿是上述 Markdown。截图脚本为 `scripts/capture-product-spec.mjs`，PDF 构建脚本为 `scripts/build-product-spec.py`。先改源稿，再重新生成发布物。
