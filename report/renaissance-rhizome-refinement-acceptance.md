# Renaissance Cyber-Rhizome 增量修订验收报告

日期：2026-07-26

对应规范：`docs/superpowers/specs/2026-07-26-renaissance-cyber-rhizome-performance-motion-notes-refinement.md`

## 1. 实现结果

本轮没有删除首页既有材料层或运动阶段。实现将持续计算改写为由可见性、输入和组件状态驱动的更新，并为书封、Collision 证据链、阅读器以及 Notes 图谱建立可直接检查的终态。

### 1.1 首页运行时

- Field、书封组装、Collision、指针与滚动更新统一进入单一帧调度边界。
- 调度器分离几何读取和样式写入；离屏、稳定、后台以及 reader 打开后的视觉层停止持续工作。
- 生产态 WebGL 不执行同步像素读取；显式 debug 参数才允许诊断采样。
- 软件栅格器自动采用 Canvas 2D 回退，避免 SwiftShader 把视觉增强变成滚动瓶颈。
- `FIDELITY / AUTO · III · II · I` 只改变内部渲染分辨率、节点密度和采样频率，不改变素材数量或运动阶段。
- 八张书页使用约 350 px 宽的 WebP 缩略图进入滚动叙事，reader 链接仍指向完整 PNG；图片声明 intrinsic dimensions，避免解码和布局抖动。
- 两册书封的扰动层改用独立低成本 fragment 资产，完整封面保持终态可读。

### 1.2 书封与 Collision

- Rhizome-Learn 界面和两本书分别维护 `unseen → assembling → settled → disturbed → recovering → settled`。
- 两册封面各自依据局部几何组装；首次归位后，反向滚动和 Resize 不会使其重新碎裂。
- 快速局部掠过产生短暂裂隙，慢速移动只保留亮度反馈；恢复时间纳入 400 ms 上限。
- Collision 改为方向可逆的横向证据链；桌面由纵向滚动驱动，移动端保留原生横向滑动。
- 四份证据逐一经历 queued、scanning、revealed、holding、receding、passed，完整显影时无偏移、旋转或裁切。

### 1.3 Reader

- Reader cursor 位于 `dialog` 的 top layer 内，不再被书页图像遮挡。
- 两册书分别使用酒红／朱砂与青／蓝渐变光晕；光标无文字提示。
- Reader 打开时暂停背景动态层；关闭、Escape、焦点陷阱和焦点返回仍保持可用。

### 1.4 Blog / Notes

- 两篇札记重写为《地图在错误之后》和《词语没有故乡》，各自保留一条思想主线、反论、损失与政治后果，并在结尾回到开篇意象。
- `/blog/`、Tag 与 Category 页面共享稳定的根茎拓扑、全文搜索和语义 HTML 文字索引。
- 静态生成器用固定模型和 revision 从清洗后的全文构建语义边；前端只读取已提交的同源 JSON，不包含向量或浏览器端远程 AI 请求。
- 每个节点的语义主边受确定性上限约束；标签边为次边，时间只参与坐标扰动。
- 桌面文章使用边注，窄屏回到文末脚注；两种形态不会产生隐藏但仍可聚焦的重复链接。
- Projects 与新札记双向可达；旧 URL 未设置 redirect。

## 2. 浏览器验收

性能 spec 不再排在长达数分钟的共享功能会话末尾，而是由独立桌面配置取得新浏览器进程。旧清单中的 130
项因此变为 126 项功能实例加 2 项有效性能实例；减少的 2 项只是 performance spec 在 mobile project 上的
无意义占位 skip。

| 配置     | 命令                                                  | 结果                              | 用时    |
| -------- | ----------------------------------------------------- | --------------------------------- | ------- |
| 功能回归 | `playwright.config.js`，单 worker                     | 59 passed / 67 skipped / 0 failed | 8.0 min |
| 性能门禁 | `playwright.performance.config.js`，独立桌面单 worker | 2 passed / 0 skipped / 0 failed   | 35.5 s  |

功能套件的 67 项跳过均有明确适用性边界：

| 原因                              | 数量 | 说明                                                              |
| --------------------------------- | ---: | ----------------------------------------------------------------- |
| 桌面／移动项目中的互斥断言        |   24 | Homepage 19 项，Interactions 5 项                                 |
| 本作品集未保留的可选 starter 夹具 |   21 | Distill 4 项，publications / repositories / teaching 等交互 17 项 |
| 当前两篇文章不产生分页            |    2 | desktop 与 mobile 各 1 项                                         |
| 未提供外部 `BASELINE_URL`         |   20 | Distill parity 4 项，Home / Projects / Notes / CV parity 16 项    |
| 合计                              |   67 | 没有因功能失败、Long Task API、WebGL 不可用或异常中止而跳过       |

已覆盖的真实功能边界包括 1920 × 1080、1440 × 1100、390 × 844、合成高频 rAF、Reduced
Motion、JavaScript 关闭、键盘导航、WebGL 与强制 Canvas 2D 回退。完整素材、两册书封的独立终态与双向快速
滚动恢复、Collision 可逆横向证据链、reader top-layer cursor、八张书页、Notes 搜索／图谱／分类／标签及
无 JavaScript 语义入口均通过对应断言。

## 3. 性能证据与边界

严格软件压力环境用于检查调度器工作量、离屏休眠、完整热区路径和回退逻辑，但不能冒充真实硬件合成器的
最终帧呈现。最终独立命令为 2 / 2 通过；其中一组保存的完整通过样本记录：

1. 10 秒热区路径经过 hero、identity、research、translation、collision、contact 六章；Collision 进度从
   `0` 到 `1`。
2. 记录到 1 次超过 50 ms 的 Long Task，持续 162 ms；符合“最多一次”的规范边界，该单次成本未被隐藏。
3. scheduler work P90 为 0.3 ms、最大 5.8 ms；field callback P90 为 0 ms、最大 5.6 ms。
4. Hero 可见且 Field 实际提交绘制的窗口取得 64 个有效样本；P90 为 83.4 ms，低于 100.005 ms 预算。
5. Hero 离屏后的 field rendered、callback、scheduler 增量均为 0。

重复运行也暴露了 Windows 软件合成环境的抖动：一次运行出现 2 次 Long Task 且 Hero P90 为 150 ms；随后一次
热区通过，但 Hero P90 为 100.1 ms，较 100.005 ms 门槛高 0.095 ms；最终独立运行 2 / 2 通过。测试门槛未
放宽，这也是性能套件必须独占新浏览器进程、不能附着在完整功能会话之后的原因。上述抖动不能被表述为已经
定位到某一浏览器或前台窗口。

Intel Iris Xe 硬件 renderer 的补充 cadence 样本取得 64 个有效样本，P90 为 88.9 ms，低于 100.005 ms；
但同一次硬件 10 秒热区运行记录 7 次 Long Task、总计 473 ms、最大 90 ms，因此不能声称硬件整套门禁已通过。
本轮可确认的是 JS 调度工作量已低于 8 ms 门槛、离屏休眠成立、最终软件严格套件通过；硬件热区数据保留为
外部运行环境仍需继续观察的边界。

## 4. 静态、构建与格式

| 检查                                     | 结果                                                                |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `npm.cmd run verify:assignment`          | 通过                                                                |
| `npm.cmd run verify:notes-graph`         | 通过；14 nodes / 13 edges / `ccdbe183666c`                          |
| Windows fresh-checkout 图谱校验          | 通过；源文件哈希统一 LF／CRLF 后结果一致                            |
| `npm.cmd run lint:style-contract`        | 通过                                                                |
| 12 个任务 JS / MJS / Playwright 文件语法 | `node --check` 全部通过                                             |
| `git diff --check`                       | 通过；仅 Git 的 LF → CRLF 工作树提示                                |
| 本轮 39 个文本文件 Prettier              | 通过                                                                |
| 全仓 `npm.cmd run lint:prettier`         | 未通过；仅命中 37 个未改动的 starter 历史文件                       |
| 本地 QA Jekyll build                     | 通过；使用 `_config.yml,test/visual/jekyll.test.yml` 与 `/al-folio` |
| Windows production-config build          | 退出码 0；生成 129 个响应式图片变体                                 |
| GitHub Actions production build          | 通过；Deploy site run `30189204125` 全步骤 success                  |

全仓 Prettier 的 37 个命中项包括 `_data/socials.yml`、`_pages/404.md`、`_pages/cv.md`、`_pages/projects.md`
以及 starter 自带的 agent、instruction、devcontainer、RenderCV、compose 和旧测试辅助文件；它们均不在本轮
diff 中。本轮 39 个文本文件已独立通过同一 Prettier 配置，没有为追求全仓绿色而重排无关 starter 文件。

Windows production-config build 完成页面与 129 个图片变体后，`jekyll-imagemagick` 仍输出了非致命的
`Invalid Parameter - /Users` 路径提示；Jekyll 退出码为 0，首页、Blog、两篇文章和语义图谱产物均存在。该提示
只记录本地 Windows 插件边界，不能替代 Linux GitHub Actions 的 production build 结论。

## 5. 人工视觉证据

- `screenshots/refinement-home-1440x1100.png`：1440 × 1100 Hero 终态。
- `screenshots/refinement-reader-cursor.png`：书页 reader 与无文字、亮度渐变光晕 cursor 同处 top layer。
- `screenshots/refinement-notes-atlas.png`：Notes 固定拓扑根茎图及分类／标签入口。

三张截图均由本地 QA 构建生成；公开 Pages 已在合并和部署后复核。

## 6. 公开部署

- PR [#2](https://github.com/Virginids-Cavendish/Virginids-Cavendish.github.io/pull/2) 已 squash 合并到
  `main`，功能提交为 `6f3e0f943268141ccc91fd6666da87bc4b1600d3`。
- [Deploy site run 30189204125](https://github.com/Virginids-Cavendish/Virginids-Cavendish.github.io/actions/runs/30189204125)
  的内容校验、Jekyll build、CSS 清理和 Deploy 步骤全部成功。
- 首页、Blog、两篇札记、语义图谱 JSON、书页缩略图和封面 fragment 共 7 个缓存绕过探针均返回 HTTP 200，
  页面标题与图谱哈希标记正确。
- 线上 `renaissance-rhizome.js` 与本地 production 产物仅有 LF／CRLF 差异；统一换行后的 SHA-256 均为
  `4860011df761c87efd924e93ca773310db104db969af0ca76ae428b807cdfee1`。
- 公开站点真实浏览器快照中，首页 runtime 为 `ready`，包含 6 个章节、8 张书页和 2 本书封；Notes runtime
  为 `ready`，包含 14 个图节点与 2 篇文字索引；未捕获 `pageerror` 或 console error。

## 7. 当前结论

本轮功能回归、严格软件性能门禁、静态图谱、站点边界和本地 Jekyll 构建均已完成且无失败。明确保留的边界有
三项：67 个适用性 skip 不等于 67 个通过；未配置外部视觉基线；Intel Iris Xe 的补充热区运行没有通过严格
Long Task 次数门槛。GitHub Pages 的构建、部署、关键资源探针与线上运行时复核均已通过。
