# Checklist: Personal Website Assignment

日期：2026-07-24

只有拿到证据后才把 `[ ]` 改成 `[x]`。

## 内容

- [x] 首页包含 `Hero`、`About`、`Skills`、`Projects`、`Contact` 五个区块；证据：`screenshots/homepage-desktop.png`。
- [x] 首页无模板作者信息、占位文字和虚构经历；证据：`node scripts/verify-assignment.mjs`。
- [x] About 内容真实说明深圳大学金融科技背景和研究方向；证据：线上首页截图。
- [x] Skills 包含 Mathematical Modeling、Optimal Control、Adaptive Learning、Project Management、Web/Tooling；证据：桌面端与手机端截图。
- [x] Projects 展示 Rhizome-Learn 与 Translation Projects；证据：项目页截图或首页项目区截图。
- [x] Contact 只展示 GitHub 与邮箱，链接可点击；证据：浏览器点击验证。

## 功能

- [x] GitHub Pages 链接可在无痕窗口打开；证据：`screenshots/github-pages.png`。
- [x] 导航可进入 Projects、Blog/Notes、CV 和首页；证据：浏览器点击验证。
- [x] Rhizome-Learn 不公开私有仓库链接；证据：静态扫描和项目页检查。
- [x] Translation Projects 不提供 PDF 下载和长正文；证据：静态扫描和项目页检查。

## 显示

- [x] 桌面端无横向溢出、遮挡和不可读文字；证据：`screenshots/homepage-desktop.png`。
- [x] 手机端文字可读，Hero、About、Skills、Projects、Contact 顺序清晰；证据：`screenshots/homepage-mobile.png`。
- [x] 图片加载正常且有 alt 文本；证据：浏览器检查与截图。
- [x] Hero 主视觉在桌面端有第一屏冲击力，移动端不遮挡正文；证据：桌面端和手机端截图。

## 工程

- [x] `README.md` 写明模板来源、主要修改、GitHub Pages 链接、本地预览方式和隐私说明。
- [x] `docs/prd.md`、`docs/design.md`、`docs/checklist.md` 存在且与最终网站一致。
- [x] `report/final-report.md` 覆盖定位、模板选择、AI 协作、验证结果、Pages 链接、问题与后续计划。
- [x] `screenshots/` 至少包含桌面端、手机端、GitHub Pages 或部署状态、完成后的 Checklist 四张证据。
- [x] GitHub 至少有 3 次有意义 commit；证据：`git log --oneline`。
- [x] 仓库不包含密码、API Key、Token、`.env`、课程邀请码、私人手机号、住址、身份证信息或本地路径；证据：`node scripts/verify-assignment.mjs`。

## 提交

- [ ] TA-Claw 预览中代码树、报告、截图、匹配会话和被排除文件无误。
- [ ] 完成二次确认并看到 `Submitted successfully` 回执；证据：提交回执截图。
