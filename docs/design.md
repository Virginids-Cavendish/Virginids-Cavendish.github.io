# Design: Virginids Personal Academic Portfolio

日期：2026-07-24

## 1. 页面结构

浏览顺序：

1. `Hero`：第一屏主视觉，展示阎光锋 / Virginids、研究定位、关键词和入口按钮。
2. `About`：说明深圳大学金融科技学生背景，以及运筹学、控制理论、自适应动态学习和自动驾驶方向。
3. `Skills`：以五组能力呈现 Mathematical Modeling、Optimal Control、Adaptive Learning、Project Management、Web/Tooling。
4. `Projects`：展示 Rhizome-Learn 和 Translation Projects。
5. `Contact`：仅提供 GitHub 与邮箱。

独立页面：

- `Projects`：项目详情页。
- `Blog/Notes`：研究札记和翻译札记。
- `CV`：教育背景、技能、项目与翻译项目。

隐藏或移除空的 `Publications`、`Repositories`、`Teaching`、`Books` 等模板示例页面。

## 2. 视觉风格

整体风格为高档、克制、实验性的学术作品集，而不是普通简历页或营销落地页。

- 主视觉：研究地形、控制系统轨迹、相图曲线、节点网络和 rhizome network。
- 头像：用户提供的真人头像作为网络中的身份节点。
- 主色：冷灰白与墨绿。
- 强调色：少量铜色或 muted red。
- 避免：紫色/蓝紫渐变、霓虹赛博风、装饰性光球、过度仪表盘和大面积单一色调。
- 字体层级：Hero 使用最大标题；页面内部标题紧凑清晰；按钮和卡片文字不得溢出。

## 3. 响应式要求

- 桌面端首屏应看到 Hero 主视觉和下一段内容提示。
- 移动端保留 Hero、About、Skills、Projects、Contact 的清晰顺序。
- 文字、按钮、项目卡片和图片不得横向溢出。
- 主视觉在移动端可以裁切和降级，优先保证可读性。
- 图片必须有 alt 文本。

## 4. 内容来源与许可

- 个人姓名、邮箱、GitHub、学校背景、研究方向来自本人确认。
- Rhizome-Learn 来自本人项目，但只公开脱敏描述和允许公开的网页截图。
- 《陌异女性主义》《平台社会主义》为本人译著，只展示翻译项目简介，不提供 PDF 下载。
- 头像使用用户提供图片。
- Hero 视觉使用用户确认的生成参考图方向，并在本项目中处理为网站资产。
- al-folio 模板遵循原仓库 MIT License。

## 5. 技术边界

- 保持 al-folio/Jekyll/GitHub Pages 技术栈。
- 优先修改 `_config.yml`、`_data/`、`_pages/`、`_projects/`、`_posts/`、`assets/img/`、`_sass/`。
- 不引入登录、数据库、服务端接口、付费托管或访客追踪。
- 不复制主题 gem 内部实现；只做站点级内容和样式覆盖。
- GitHub Pages 优先使用 al-folio 自带 GitHub Actions。

## 6. 文件映射

- `_config.yml`：站点身份、URL、导航相关功能、博客和全局配置。
- `_data/socials.yml`：公开联系方式。
- `_data/cv.yml`：CV 页面数据。
- `_pages/about.md`：首页五个区块。
- `_pages/projects.md`：项目列表入口。
- `_pages/blog.md`：Blog/Notes 入口。
- `_pages/cv.md`：CV 页面配置。
- `_projects/`：Rhizome-Learn 与 Translation Projects 详情。
- `_posts/`：研究札记和翻译札记。
- `assets/img/`：头像、Hero 图、项目预览图。
- `_sass/`：本项目样式覆盖。
- `docs/`：PRD、Design、Checklist。
- `report/`：最终报告。
- `screenshots/`：验证截图。

## 7. 隐私与披露边界

- 公开：阎光锋 / Virginids、GitHub、邮箱、学校与专业背景、研究方向、公开项目描述、译著项目名称。
- 可公开但需脱敏：Rhizome-Learn 网页截图。
- 不公开：课程邀请码、密码、API Key、Token、`.env`、私人手机号、住址、身份证件、私人反馈、题库正文、教材 PDF 页面、本地路径、私有仓库链接、译著 PDF 下载或长正文。
