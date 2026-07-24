# PRD: Virginids Personal Academic Portfolio

日期：2026-07-24

## 1. 项目目标

建立一个可公开访问、可长期更新的个人学术作品集网站，用于展示阎光锋 / Virginids 的学习背景、研究兴趣、项目方向、翻译项目与公开联系方式。

本期目标首先满足课程个人网站实验要求：完成真实内容、规范过程、GitHub Pages 发布、验证截图与 TA-Claw 提交证据链。

## 2. 目标访问者

- 课程教师与助教：检查个人网站实验是否满足规范化 AI 开发流程。
- 同学与潜在协作者：快速了解研究兴趣、项目方向和可联系渠道。
- 未来项目伙伴：判断是否适合围绕控制理论、自适应动态学习、自动驾驶或工具化学习系统展开合作。

访问者最先寻找的信息是：我是谁、正在研究什么、有哪些能公开展示的项目、如何联系。

## 3. 一句话定位

我是深圳大学金融科技学生阎光锋 / Virginids，正在学习运筹学与控制理论，并探索用自适应动态学习方法解决自动驾驶及复杂学习系统中的决策问题。

## 4. 本期范围

- `Hero`：公开称呼、一句话定位、研究方向关键词和行动入口。
- `About`：真实个人简介、深圳大学金融科技背景和当前学习方向。
- `Skills`：Mathematical Modeling、Optimal Control、Adaptive Learning、Project Management、Web/Tooling。
- `Projects`：Rhizome-Learn 私有研究原型与 Translation Projects。
- `Contact`：GitHub 主页和邮箱。
- `Blog/Notes`：研究札记和翻译札记。
- `CV`：教育背景、技能、项目与翻译项目摘要。
- `docs/`、`report/`、`screenshots/`：课程过程材料和验证证据。

## 5. 本期不做

- 不做登录、数据库、支付、复杂后台、访客追踪或评论系统。
- 不公开私人手机号、住址、身份证件、课程邀请码、密码、API Key、Token、`.env` 或个人反馈。
- 不公开 Rhizome-Learn 私有仓库链接、题库正文、教材 PDF 内容、本地路径或接口密钥。
- 不公开《陌异女性主义》《平台社会主义》的 PDF 下载和长正文摘录。
- 不为了动画和复杂视觉牺牲发布、移动端可读性和提交证据。

## 6. 成功标准

- GitHub Pages 链接可在无痕窗口打开。
- 首页包含 `Hero`、`About`、`Skills`、`Projects`、`Contact` 五个区块。
- 内容真实，无模板作者信息、占位文字和虚构经历。
- 桌面端和手机端均可读，无明显溢出、遮挡和死链。
- `README.md`、`docs/prd.md`、`docs/design.md`、`docs/checklist.md`、`report/final-report.md` 和 `screenshots/` 完整。
- GitHub 仓库至少有 3 次有意义 commit。
- TA-Claw 预览无误并完成二次确认，获得 `Submitted successfully` 回执。

## 7. 模板选择

候选模板一：Modern Resume Theme。

- 优点：结构简单，简历、技能和项目内容容易替换。
- 缺点：研究项目、札记和长期学术作品集表达较弱。

候选模板二：al-folio。

- 优点：适合学术作品集、项目档案、CV、Blog/Notes 与长期研究主页。
- 缺点：Jekyll 构建链更复杂，需要 GitHub Actions 或 Ruby/Bundler/Docker。

最终选择 al-folio。理由是本网站需要兼顾研究方向、项目说明、CV 和后续札记更新，且 GitHub Actions 可以承担免费部署。

## 8. 个人判断与 AI 边界

AI 可以协助阅读模板、生成修改计划、编辑文件、验证链接和排查部署问题。网站定位、公开内容、隐私边界、项目表述和最终验收由本人确认。
