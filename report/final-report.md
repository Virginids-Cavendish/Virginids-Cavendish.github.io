# Final Report: Virginids Personal Website

日期：2026-07-24

## 1. 网站定位

本站是阎光锋 / Virginids 的个人学术作品集，用于展示深圳大学金融科技学生的真实学习背景、研究方向、项目原型与翻译工作。核心定位不是模板展示页，而是一个可长期更新的公开研究入口。

首页围绕五个必备区块组织：

- Hero：以研究地形、控制轨迹和 rhizome network 形成第一屏视觉识别，并明确展示姓名、方向和联系入口。
- About：说明深圳大学金融科技背景，以及运筹学、控制理论、自适应动态学习、自动驾驶问题的学习路线。
- Skills：展示 Mathematical Modeling、Optimal Control、Adaptive Learning、Project Management、Web/Tooling。
- Projects：展示 Rhizome-Learn 和 Translation Projects。
- Contact：只保留 GitHub 与邮箱。

## 2. 模板选择与修改

项目基于 al-folio 搭建。选择原因是它适合个人学术主页、项目页、CV 与 Blog/Notes，并且可以通过 GitHub Actions 发布到 GitHub Pages。

主要修改包括：

- 将模板默认身份、示例文章、示例项目和虚构经历替换为真实个人信息。
- 删除不需要公开的 Publications、Repositories、Teaching、Books 等入口。
- 用自定义首页重组 Hero、About、Skills、Projects、Contact。
- 增加研究札记与翻译札记。
- 增加 PRD、Design、Checklist、Final Report 和截图证据。
- 修复部署配置，使用 `gh-pages` 分支发布生成后的静态站点。

## 3. AI 协作流程

开发过程采用规范化 AI 协作：

- 先根据作业说明整理需求和隐私红线。
- 再通过问答确定个人定位、公开内容、项目披露边界、视觉风格和技术路线。
- 形成 PRD、Design 和 Checklist 作为可追踪文档。
- 分阶段提交代码，保留初始化、文档、内容定制、构建稳定性修复等有意义 commit。
- 在提交前运行静态检查、公开 URL 检查和浏览器截图验证。

AI 主要承担需求整理、页面结构设计、内容改写、隐私检查、部署诊断与截图生成；个人信息、项目边界、视觉风格和是否公开由本人确认。

## 4. 隐私与披露边界

公开内容：

- 姓名：阎光锋 / Virginids。
- 学校与方向：深圳大学金融科技，运筹学、控制理论、自适应动态学习、自动驾驶。
- GitHub 主页与邮箱。
- Rhizome-Learn 的脱敏方法说明和界面预览。
- 《陌异女性主义》《平台社会主义》的译著项目名称与翻译札记。

不公开内容：

- 任何敏感凭据、私有反馈、私人联系方式、身份信息。
- Rhizome-Learn 私有仓库链接。
- 题库正文、教材内容、本地路径。
- 译著 PDF 下载和长正文摘录。

## 5. 部署与访问

- Repo: https://github.com/Virginids-Cavendish/Virginids-Cavendish.github.io
- GitHub Pages: https://virginids-cavendish.github.io/
- Pages source: `gh-pages` branch, `/` folder。
- 构建方式：GitHub Actions 构建 Jekyll 站点并推送静态文件到 `gh-pages`。

本机未使用本地 Jekyll 作为最终构建依据；最终验证以 GitHub Actions 和公开 GitHub Pages URL 为准。

## 6. 验证结果

已完成验证：

- 公开 URL 返回 HTTP 200，页面标题为 `Virginids`。
- `gh-pages` 分支包含生成后的 `index.html`、Projects、Blog/Notes、CV 和图片资源。
- 桌面端与手机端首页截图已保存。
- 部署状态截图已保存。
- Checklist 截图已保存。
- `scripts/verify-assignment.mjs` 用于检查必备文件、必备文本和敏感内容风险。

截图文件：

- `screenshots/homepage-desktop.png`
- `screenshots/homepage-mobile.png`
- `screenshots/github-pages.png`
- `screenshots/checklist.png`

## 7. 后续计划

TA-Claw 提交前需要最后确认：

- 预览代码树不包含无关缓存文件。
- 报告和截图能被系统识别。
- GitHub Pages 链接可公开访问。
- 二次确认后保存提交成功回执。

后续可继续补充研究笔记、课程项目复盘、更多脱敏项目截图，以及更正式的 CV 内容。
