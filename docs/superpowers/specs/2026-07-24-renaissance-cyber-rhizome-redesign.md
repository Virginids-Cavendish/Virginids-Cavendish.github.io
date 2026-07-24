# Design Spec: Renaissance Cyber-Rhizome Redesign

日期：2026-07-24

## 1. 背景与退回原因

当前首页完成了课程要求的结构和发布，但视觉表现不满足下一版目标：

- 缺少可感知动效，页面更像静态简历。
- UI 语言依赖常见圆角矩形卡片，缺少高辨识度。
- 风格偏克制学术，没有形成“文艺复兴 × 赛博朋克”的强烈混合气质。
- Hero 图像接近树状或山脉中心结构，没有呈现无中心、非层级、可多入口进入的 rhizome。

新版目标是把网站从“干净学术主页”重做为“高级实验性学术作品集”，但仍保留真实个人信息、GitHub Pages 稳定性和课程作业可评分结构。

## 2. 总体方向

采用 `Renaissance Cyber-Rhizome` 风格：文艺复兴手稿、铜版画、几何比例和赛博朋克神经网络、霓虹扫描、控制系统轨迹结合。

关键词：

- Renaissance manuscript
- Copperplate diagram
- Cyberpunk control room
- Decentered rhizome
- Adaptive learning system
- Autonomous decision field

不采用纯赛博朋克，也不采用纯古典文艺复兴。古典部分提供秩序、纸张纹理、比例和知识图谱感；赛博部分提供动态、发光、反馈和未来系统感。

## 3. Hero 重做要求

Hero 必须成为第一版变化最大的部分。

### 3.1 Rhizome 图像要求

Hero 不再使用当前树状/山脉中心图作为主体。新 Hero 应呈现无中心 rhizome：

- 网络没有唯一主干、树根、树冠或中心发散点。
- 线条从多个边缘进入画面，横向、斜向、回环、交叉、断裂、再连接。
- 节点大小不能暗示单一核心；头像只是网络中的一个身份节点，不是根或树冠。
- 允许少量控制轨迹、相图曲线、坐标刻痕、铜版画弧线。
- 禁止出现明显树干、树枝、山峰中心、放射状太阳或中心神经核。

### 3.2 Hero 布局要求

- 第一屏仍展示 `阎光锋 / Virginids`、研究定位、关键词、入口动作。
- 文本层像手稿题签或实验室标注，而不是普通居左网页标题。
- Hero 需要露出下一段内容提示，避免完全封死第一屏。
- 桌面端要有高档、复杂但不脏乱的视觉密度。
- 移动端优先保证文字可读；动效和背景可以降级。

### 3.3 Hero 动效要求

至少包含三类轻量动效：

- Rhizome 线条流动：虚线或渐变沿路径缓慢移动，形成“学习路径正在重组”的感觉。
- 节点脉冲：若干节点以不同节奏发光或呼吸，不同步闪烁。
- 指针响应：鼠标移动时背景层和头像节点产生轻微视差或光标追随。

动效需要尊重 `prefers-reduced-motion`，用户偏好减少动效时关闭或显著降低动画。

## 4. UI 语言要求

新版必须减少普通圆角矩形容器的存在感。

### 4.1 禁止或减少

- 大量普通白底圆角卡片。
- 同质化 pill 标签堆叠。
- 常规 dashboard card grid。
- 纯 beige/cream 复古纸张感，或纯霓虹黑紫赛博朋克。

### 4.2 使用

- 铭牌式标题：细线、编号、短横、铜色或青色校准刻度。
- 斜切面板：使用 `clip-path` 或伪元素做切角，不依赖大圆角。
- 手稿边注：小字号注释、坐标标签、索引号。
- 图谱分栏：About、Skills、Projects 用线性版式、刻度线和连接线组织。
- 高级色彩：深墨绿/近黑底、旧纸白、铜色、少量青绿霓虹、少量洋红或电蓝点亮。

Cards 如仍需存在，边角不超过 8px，并通过细线、切角、编号、浮动刻度和光效区别于普通卡片。

## 5. 内容结构保持

必须继续满足课程结构：

- Hero
- About
- Skills
- Projects
- Contact

内容事实保持不变：

- 阎光锋 / Virginids
- 深圳大学金融科技学生
- 运筹学、控制理论、自适应动态学习、自动驾驶
- Rhizome-Learn 私有研究原型，只公开脱敏描述和预览
- Translation Projects 包含《陌异女性主义》和《平台社会主义》
- Contact 只展示 GitHub 与邮箱

## 6. 技术方案

保持 al-folio / Jekyll / GitHub Pages。

建议实现方式：

- `_pages/about.md`：重写首页结构、CSS、少量 JS。
- `assets/img/renaissance-cyber-rhizome-hero.svg`：用可控 SVG 表达无中心 rhizome 网络，避免依赖不稳定生成图。
- `assets/js/renaissance-rhizome.js`：轻量指针视差、节点状态、CSS 变量更新。
- `scripts/verify-assignment.mjs`：增加新版视觉特征检查，如 `Renaissance Cyber-Rhizome`、`prefers-reduced-motion`、`clip-path`、动画类名、无中心 rhizome 资源。

不引入 React、Three.js、重型构建链或付费服务。若实现 SVG 动效，优先使用 CSS keyframes 和 SVG stroke-dashoffset。

## 7. 可验证验收标准

实现完成后必须验证：

- `npm.cmd run verify:assignment` 通过。
- 首页源码包含新版风格关键字和动效支持。
- 公开首页仍返回 HTTP 200。
- 桌面截图显示 Hero 有文艺复兴 × 赛博朋克混合风格。
- 手机截图文字不被背景、头像或动画遮挡。
- Hero 图像不再像树状中心结构。
- 页面可见动效存在：线条流动、节点脉冲、指针响应。
- `prefers-reduced-motion` 下动效降级。
- UI 不再以普通圆角矩形卡片为主。

## 8. 风险与控制

- 视觉过度复杂：通过限制色彩、控制动效速度、保持清晰文字层来控制。
- 赛博朋克过俗：避免大面积紫蓝渐变和夸张霓虹，只用线条与节点点亮。
- 古典感过旧：用动态反馈、控制轨迹、终端式刻度和未来色点更新气质。
- GitHub Pages 构建风险：不新增复杂依赖，主要修改静态 HTML/CSS/SVG/JS。
- 作业风险：报告和截图可以更新，但不能删除已满足要求的文档、隐私边界和验证脚本。
