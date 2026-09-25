# 卡牌素材与版本

卡牌数据（名称、星级、估值、数量）在 `catalog.csv` 和 `web/catalog.js`；**图片选择只改本目录的 `assets.csv`**。当前图片版本是 `v1.1.0`：网页使用 81 张新实体卡面 PNG，卡背和总览也有索引。81 张独立插画记录在 `art_image`，留给未来重排版或按卡检索，不会打包到网页，因此不会让玩家额外下载约 195 MB 的源插画。

公开 Git 仓库保存已发布的 83 张网页卡面（根目录 `assets/v1.1.0/`）、CSV 映射及归档 SHA-256，不保存原始分层插画与印刷素材。本地原图存在时会逐张校验原图；全新克隆没有原图时，构建会对照归档 SHA-256 校验已发布卡面，并使用这些卡面生成网页。要制作新素材版本，需另行取得原始素材，并在发布前归档新版卡面和校验值。

## CSV 怎么改

表头固定为 `id,web_image,art_image`。每张卡牌一行，`id` 对应 `catalog.csv`；`web_image` 是网页展示的完整卡面，`art_image` 是原始独立插画。所有图片路径都**相对 `cards/`**，例如：

```csv
id,web_image,art_image
@version,v1.1.0,
@back,千年藏珍_81张实体卡素材/统一卡背.png,
@overview,81张正面总览.jpg,
汉-1-1,千年藏珍_81张实体卡素材/正面_PNG_含出血/汉-1-1.png,千年藏珍_81张独立插画层/独立插画层/汉-1-1_五铢钱.png
```

`@version` 是这一整套映射的版本号。`@back` 和 `@overview` 分别记录通用卡背和 81 张总览。某张卡的 `web_image` 留空时，网页回到旧版的文字卡面；只想替换部分卡，也可以只改那些卡的路径。`web_image` 最好指向**含准确印字的完整卡面**；独立插画不含完整文字，主要用来制作新版卡面。图片支持 PNG、JPG、WebP、SVG。CSV 不接受绝对路径和目录外路径。

1. 将新图片放在 `cards/` 内，修改 `assets.csv` 对应行的相对路径。
2. 将 `@version` 升为新号，例如 `v1.1.1`。同一版本号对应固定的 CSV 与图片内容；不要原地覆盖旧图片。
3. 运行 `npm run assets:check`。它检查 81 张卡的 ID、文件路径及 SHA-256，并自动把首次出现的版本存入 `releases/v1.1.1.csv` 和同名校验文件。
4. 本地服务刷新网页即可看到新映射。公开站点运行 `npm run build:cloud`，再发布新生成的 `cloud-site/`；仅修改本机 CSV 不会自动改变已发布的网站。构建时会把选中的图片放入带版本号的 `assets/<version>/`，旧版路径可继续用于回溯。

要回到已经归档的版本，运行 `npm run assets:use -- v1.0.0` 或 `npm run assets:use -- v1.1.0`，再刷新本地页面或重新构建并发布公开网页。也可手动把 `releases/` 中的对应 CSV 复制为 `assets.csv`。历史源文件与归档清单都需保留，才能真正回溯；`releases/*.sha256.json` 会发现历史源文件被改动。

## 现有版本

| 版本 | 网页卡面 | 来源 |
|---|---|---|
| `v1.0.0` | 原版 HTML/CSS 文字卡面 | `releases/v1.0.0.csv`；旧 SVG 仍在 `print/` 供印刷参考 |
| `v1.1.0` | 新版 81 张实体卡面 PNG | `releases/v1.1.0.csv`；实体卡素材包与独立插画层；[GitHub 发布版本](https://github.com/rick1269/millennium-treasures-online/releases/tag/v1.1.0) |

`node cards/build-cards.js` 仍可从 `web/catalog.js` 重新生成旧版 SVG 与印刷清单；此操作不会改 `assets.csv`。新 PNG 自带约 3 mm 出血，网页按原图完整显示；实体印刷请遵循素材包的《印刷与文件说明.txt》。正式对外发行前仍应核实卡名涉及的史实。
