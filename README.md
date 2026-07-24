# Virginids-Cavendish.github.io

阎光锋 / Virginids 的个人学术作品集网站。项目用于 OPC-AI 培训营个人网站实验，也作为后续长期更新的公开主页基础。

## Site

- GitHub Pages: https://virginids-cavendish.github.io/
- GitHub profile: https://github.com/Virginids-Cavendish
- Contact: virginids301@gmail.com

## Template

本项目基于 al-folio 搭建。

- Template repository: https://github.com/alshedivat/al-folio
- Template license: MIT License
- 选择理由：al-folio 适合学术作品集、研究项目、CV 与 Blog/Notes，并可通过 GitHub Actions 部署到 GitHub Pages。

## Main Modifications

- 将网站定位改为控制理论、运筹学、自适应动态学习与自动驾驶方向的个人研究作品集。
- 首页覆盖课程要求的 `Hero`、`About`、`Skills`、`Projects`、`Contact` 五个基础区块。
- 项目页展示 Rhizome-Learn 私有研究原型与 Translation Projects。
- Blog/Notes 只保留研究札记和翻译札记。
- CV 改为真实教育背景、技能、项目与翻译项目摘要。
- 视觉风格采用研究地形、控制系统轨迹和 rhizome network 的概念图形。

## Local Preview

al-folio 是 Jekyll 项目。若本机安装了 Ruby 和 Bundler，可以运行：

```powershell
bundle install
bundle exec jekyll serve
```

当前本机环境以 GitHub Actions 作为主要构建路径；本地缺少 Ruby/Bundler/Docker 时，使用 GitHub Pages 部署结果与浏览器截图完成公开访问验证。

## Assignment Evidence

- PRD: `docs/prd.md`
- Design: `docs/design.md`
- Checklist: `docs/checklist.md`
- Final report: `report/final-report.md`
- Screenshots: `screenshots/`
- Verification script: `scripts/verify-assignment.mjs`

## Privacy

仓库不包含密码、API Key、Token、`.env`、课程邀请码、私人手机号、住址、身份证件、私人反馈、Rhizome-Learn 私有仓库链接、题库正文、教材 PDF 截图、译著 PDF 下载或本地文件路径。
