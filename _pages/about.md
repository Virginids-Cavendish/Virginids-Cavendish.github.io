---
layout: default
title: Home
permalink: /
nav: false
nav_order: 1
description: 阎光锋 / Virginids 的个人学术作品集首页。
---

<style>
  :root {
    --vg-ink: #1f3430;
    --vg-muted: #60726b;
    --vg-soft: #f5f1e8;
    --vg-line: #d9ded8;
    --vg-copper: #ad6034;
    --vg-panel: rgba(255, 255, 255, 0.82);
  }

  .vg-home {
    color: var(--vg-ink);
  }

  .vg-hero {
    position: relative;
    min-height: min(760px, calc(100vh - 72px));
    margin: -1.5rem calc(50% - 50vw) 3rem;
    padding: clamp(4rem, 8vh, 6rem) max(7vw, calc((100vw - 1040px) / 2)) 3.5rem;
    overflow: hidden;
    background: var(--vg-soft);
    display: grid;
    align-items: center;
  }

  .vg-hero img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    z-index: 0;
  }

  .vg-hero-copy {
    position: relative;
    z-index: 1;
    max-width: 640px;
  }

  .vg-kicker {
    margin: 0 0 1rem;
    color: var(--vg-copper);
    font-size: 0.86rem;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .vg-hero h1 {
    margin: 0;
    color: var(--vg-ink);
    font-size: clamp(3.4rem, 7vw, 6.4rem);
    line-height: 0.96;
    letter-spacing: 0;
  }

  .vg-hero-lede {
    max-width: 560px;
    margin: 1.35rem 0 0;
    color: #314b45;
    font-size: clamp(1.1rem, 2vw, 1.42rem);
    line-height: 1.7;
  }

  .vg-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 1.7rem;
  }

  .vg-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0.72rem 1.05rem;
    border: 1px solid var(--vg-ink);
    border-radius: 8px;
    color: var(--vg-ink);
    font-weight: 700;
    text-decoration: none;
  }

  .vg-action.primary {
    background: var(--vg-ink);
    color: #fff;
  }

  .vg-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1.5rem;
  }

  .vg-tags span {
    padding: 0.3rem 0.62rem;
    border: 1px solid rgba(31, 52, 48, 0.24);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.54);
    color: #314b45;
    font-size: 0.84rem;
  }

  .vg-section {
    margin: 4rem 0;
  }

  .vg-section h2 {
    margin: 0 0 1rem;
    color: var(--vg-ink);
    font-size: clamp(1.65rem, 3vw, 2.25rem);
    letter-spacing: 0;
  }

  .vg-section p {
    color: #344f49;
    line-height: 1.85;
  }

  .vg-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 1rem;
  }

  .vg-card {
    min-height: 148px;
    padding: 1.15rem;
    border: 1px solid var(--vg-line);
    border-radius: 8px;
    background: var(--vg-panel);
  }

  .vg-card h3 {
    margin: 0 0 0.6rem;
    color: var(--vg-ink);
    font-size: 1.05rem;
    letter-spacing: 0;
  }

  .vg-card p {
    margin: 0;
    font-size: 0.96rem;
  }

  .vg-project {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.1fr);
    gap: 1.4rem;
    align-items: center;
    margin-top: 1rem;
    padding: 1rem 0;
    border-top: 1px solid var(--vg-line);
  }

  .vg-project img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: contain;
    padding: 0.5rem;
    background: var(--vg-soft);
    border-radius: 8px;
    border: 1px solid var(--vg-line);
  }

  .vg-contact {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
    padding: 1.25rem 0;
    border-top: 1px solid var(--vg-line);
    border-bottom: 1px solid var(--vg-line);
  }

  .vg-contact a {
    color: var(--vg-ink);
    font-weight: 700;
  }

  @media (max-width: 760px) {
    .vg-hero {
      min-height: 720px;
      padding: 4.5rem 1.2rem 2rem;
      align-items: start;
    }

    .vg-hero img {
      object-position: 64% center;
      opacity: 0.72;
    }

    .vg-hero-copy {
      max-width: 100%;
    }

    .vg-project {
      grid-template-columns: 1fr;
    }
  }
</style>

<main class="vg-home">
  <section id="hero" class="vg-hero" aria-label="Hero">
    <img src="{{ '/assets/img/research-terrain-hero.png' | relative_url }}" alt="Research terrain with control trajectories and a portrait identity node">
    <div class="vg-hero-copy">
      <p class="vg-kicker">Control Theory / Adaptive Learning / Rhizome</p>
      <h1>阎光锋<br>Virginids</h1>
      <p class="vg-hero-lede">深圳大学金融科技学生，学习运筹学和控制理论，探索用自适应动态学习解决自动驾驶及复杂学习系统中的决策问题。</p>
      <div class="vg-actions">
        <a class="vg-action primary" href="{{ '/projects/' | relative_url }}">View Projects</a>
        <a class="vg-action" href="mailto:virginids301@gmail.com">Contact</a>
      </div>
      <div class="vg-tags" aria-label="Research keywords">
        <span>Mathematical Modeling</span>
        <span>Optimal Control</span>
        <span>Adaptive Learning</span>
        <span>Autonomous Driving</span>
      </div>
    </div>
  </section>

  <section id="about" class="vg-section" aria-label="About">
    <h2>About</h2>
    <p>我目前在深圳大学学习金融科技，同时把个人研究兴趣放在运筹学、控制理论、自适应动态学习和自动驾驶问题上。这个网站不是完整简历，而是一个持续生长的公开研究入口：记录项目、方法札记、翻译工作和可复核的学习路径。</p>
    <p>我更关心系统如何在约束中学习、如何通过反馈修正策略，以及知识工具如何帮助人建立长期、可追踪的理解结构。</p>
  </section>

  <section id="skills" class="vg-section" aria-label="Skills">
    <h2>Skills</h2>
    <div class="vg-grid">
      <article class="vg-card">
        <h3>Mathematical Modeling</h3>
        <p>用变量、约束、目标函数和状态描述问题结构。</p>
      </article>
      <article class="vg-card">
        <h3>Optimal Control</h3>
        <p>关注反馈、动态规划、状态空间和策略稳定性。</p>
      </article>
      <article class="vg-card">
        <h3>Adaptive Learning</h3>
        <p>探索学习系统如何根据轨迹、误差和反馈持续调整。</p>
      </article>
      <article class="vg-card">
        <h3>Project Management</h3>
        <p>重视范围边界、过程记录、验证证据和可追溯提交。</p>
      </article>
      <article class="vg-card">
        <h3>Web/Tooling</h3>
        <p>使用 GitHub Pages、Jekyll、Markdown 和 AI Agent 构建工具化作品。</p>
      </article>
    </div>
  </section>

  <section id="projects" class="vg-section" aria-label="Projects">
    <h2>Projects</h2>
    <article class="vg-project">
      <img src="{{ '/assets/img/rhizome-learn-preview.png' | relative_url }}" alt="Sanitized Rhizome-Learn interface preview">
      <div>
        <h3>Rhizome-Learn</h3>
        <p>一个私有研究原型，用于探索结构化学习、知识节点组织与自适应复习过程。公开版本只展示脱敏界面与方法说明，不展示题库正文、教材内容、本地路径或私有仓库链接。</p>
      </div>
    </article>
    <article class="vg-project">
      <img src="{{ '/assets/img/translation-xenofeminism-wide.png' | relative_url }}" alt="Xenofeminism translation project cover">
      <div>
        <h3>Translation Projects</h3>
        <p>《陌异女性主义》和《平台社会主义》是我的译著项目。网站只展示项目名称、主题和翻译札记，不提供 PDF 下载和长正文摘录。</p>
      </div>
    </article>
  </section>

  <section id="contact" class="vg-section" aria-label="Contact">
    <h2>Contact</h2>
    <div class="vg-contact">
      <span>GitHub: <a href="https://github.com/Virginids-Cavendish">Virginids-Cavendish</a></span>
      <span>Email: <a href="mailto:virginids301@gmail.com">virginids301@gmail.com</a></span>
    </div>
  </section>
</main>
