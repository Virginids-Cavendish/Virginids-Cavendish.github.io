# Renaissance Cyber-Rhizome 首页验收报告

日期：2026-07-26

结论：本地实现、桌面与移动端浏览器验收、静态降级验收均已完成。交付边界为本地提交；当前分支同时保留此前的规格提交 `44dc853`。没有执行 push 或部署。

## 交付范围

- 首页采用六段连续叙事：Hero、Identity、Rhizome-Learn、Translation Projects、Collision Field、Contact。
- Hero 改为暗室仪器构图；无中心网络由固定种子的 Canvas 2D 网络与真实 WebGL 动态场共同构成。
- `Virginids` 使用本地 Unifraktur 哥特字体。
- 中文签名使用用户提供的 `閻`、`光`、`鋒` 三张原始笔迹抠图；没有 AI 补笔或跨字牵丝。
- Rhizome-Learn 真实界面有完整清晰态、切片态和重新组装态。
- 两本书的封面均完整出现；八张 PDF 正文页可通过键盘、鼠标或触摸进入阅读器。
- Collision Field 同时容纳界面、书封和书页，在局部交汇处触发旧金 glitch，之后进入大面积留白释放。
- Contact 的 SVG 网络与两条光路越出视口，但页面本身没有横向滚动。

## 规格映射

| 规格要求                       | 实现或证据                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 非圆角卡片、Hero 非树状        | `assets/css/renaissance-rhizome.css` 的全出血仪器布局；桌面与移动 Hero 截图                             |
| 原始书法与哥特字标             | 三张 `name-*-extracted.png`、本地 `UnifrakturCook-Bold.ttf`；浏览器验证字体加载和图片固有尺寸           |
| 真实界面、两本封面、正文页阅读 | `assets/img/renaissance-rhizome/`；八张页面逐一打开、解码并检查阅读尺寸                                 |
| 受控增密、过载、释放           | Research 组装态、Collision 四层素材、旧金 glitch、至少 60% 视口高度的 release 自动化断言                |
| 自主呼吸、局部探索、滚动变换   | 非稳定会话中检查帧推进、节点位置校验和、场能量、最近节点命中、章节状态和素材变换                        |
| 指针、触摸、倾斜               | 桌面 Canvas 节点 `SAMPLE` 命中；移动触点波纹与局部场响应；授权后的设备方向值进入运行时                  |
| 声音手势边界                   | Mock AudioContext 证明页面加载时零创建，用户点击后才创建并振荡；会话选择在 reload 后保留                |
| 动态性能降级                   | 慢帧测试验证 High → Medium → Low、92 → 72 → 52 节点、60 → 30 → 20 fps、跳帧和透明层同步降级             |
| Reduced Motion 与后台暂停      | Reduced Motion 下帧数和节点校验和保持不变；隐藏文档后 RAF 停止、恢复可见后继续                          |
| WebGL 与 2D 回退               | WebGL 可用时验证 `hybrid-webgl`、真实绘制次数和非透明像素；强制禁用时验证可见且固定种子的 `2d-fallback` |
| 键盘与阅读器                   | 全页 Tab 链、焦点可见性、Enter 打开、Tab/Shift+Tab 焦点约束、Escape 关闭与焦点返回                      |
| 无 JavaScript                  | 1440 × 1100 与 390 × 844 均验证书法、界面、两封面、八张 PNG 页面和所有核心出口                          |
| 主题壳层                       | 桌面导航右对齐、搜索、主题切换、移动导航展开与收起分别通过                                              |

规格中的“聚焦正文页时进入完整阅读态”按无障碍键盘语义落实为：焦点落到页面入口后按 Enter 打开阅读器。没有在 `focus` 事件上自动弹出 modal，以免 Tab 遍历八张书页时被连续截断。

## 自动化结果

- `npm.cmd run verify:assignment`：通过。
- `npm.cmd run lint:style-contract`：通过。
- 目标文件 Prettier 检查：通过。
- `node --check assets/js/renaissance-rhizome.js`：通过。
- `node --check test/visual/homepage-rhizome.spec.js`：通过。
- `git diff --check`：通过。
- 三张书法抠图像素审计：透明背景存在，所有非透明像素均为纯黑，零彩色残留。
- 首页 Playwright / desktop：19 passed，2 个移动专用测试按设计 skipped。
- 首页 Playwright / mobile WebKit：11 passed，10 个桌面专用测试按设计 skipped。
- 主题壳层 Playwright：3 passed，3 个不适用平台组合按设计 skipped。

## 最终视觉证据

- `screenshots/homepage-desktop.png`：1440 × 1100 桌面 Hero。
- `screenshots/homepage-mobile.png`：390 × 844 移动 Hero。
- `output/playwright/rr-acceptance-research-assembled.png`：Rhizome-Learn 完整组装态。
- `output/playwright/rr-acceptance-collision-overload.png`：双线受控过载。
- `output/playwright/rr-acceptance-collision-glitch.png`：Collision 内的旧金反馈。
- `output/playwright/rr-acceptance-release.png`：过载后的留白释放。
- `output/playwright/rr-acceptance-desktop-full.png` 与 `rr-acceptance-mobile-full.png`：完整页面。

## 本地环境边界

本机没有 Ruby、Bundler、Jekyll 或 Docker，因此没有伪造 Jekyll 构建结果。验收期间使用临时脚本生成与 `_pages/about.md` 同源的静态预览，并提供 `/al-folio/` baseurl、主题导航壳层和真实本地资产；首页范围内的视觉、交互、降级和性能验收均在该预览上完成。临时脚本与中间素材在验收后整体移出仓库，保留于系统临时目录以便恢复。

全站 `interactions.spec.js` 中指向 publications、repositories、blog、teaching 等非首页路由的测试不适用于这个首页专用预览服务器；本期规格涉及的三个主题壳层测试已单独运行并通过。
