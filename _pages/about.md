---
layout: default
title: Home
permalink: /
nav: false
nav_order: 1
description: 阎光锋 / Virginids 的个人学术作品集首页。
---

<link rel="stylesheet" href="{{ '/assets/css/renaissance-rhizome.css' | relative_url }}">

<main
  id="rr-home"
  class="rr-root rr-home"
  data-rr-root
  data-phase="running"
  data-motion="on"
  data-sound="off"
>
  <a class="rr-skip" href="#rr-identity">Skip instrument</a>

  <section
    id="hero"
    class="rr-section rr-hero"
    data-rr-section="hero"
    aria-labelledby="rr-hero-title"
  >
    <canvas id="rr-field" class="rr-hero__canvas" data-rr-field aria-hidden="true"></canvas>

    <svg
      id="rr-overlay"
      class="rr-hero__engraving"
      data-rr-overlay
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g class="rr-engraving__calibration">
        <path d="M-40 188 C210 36 386 302 644 156 S1098 256 1640 70"></path>
        <path d="M-70 744 C214 914 392 602 690 792 S1150 634 1660 876"></path>
        <path d="M238 -40 C126 210 364 374 210 610 S284 876 174 1040"></path>
        <path d="M1284 -40 C1454 200 1190 392 1374 628 S1288 892 1452 1040"></path>
        <path d="M520 84 A250 250 0 0 1 806 356"></path>
        <path d="M1038 618 A182 182 0 0 0 1272 842"></path>
        <line x1="80" y1="92" x2="480" y2="92"></line>
        <line x1="1120" y1="918" x2="1520" y2="918"></line>
      </g>
      <g class="rr-engraving__marks">
        <path d="M80 74v36m40-18v18m40-18v18m40-18v18m40-18v28m40-28v18m40-18v18m40-18v18m40-18v28m40-28v18"></path>
        <path d="M1120 900v36m40-36v18m40-18v18m40-18v18m40-28v28m40-28v18m40-18v18m40-18v18m40-28v28m40-28v18"></path>
      </g>
    </svg>

    <picture class="rr-picture rr-hero__atlas-media">
      <source
        type="image/webp"
        srcset="{{ '/assets/img/renaissance-rhizome/impossible-atlas.webp' | relative_url }}"
      >
      <img
        class="rr-hero__atlas"
        src="{{ '/assets/img/renaissance-rhizome/impossible-atlas.png' | relative_url }}"
        alt="由菌丝、神经解剖、航路和机械测量装置交织而成的无中心蚀刻图谱"
        width="1536"
        height="1024"
        fetchpriority="high"
        decoding="async"
      >
    </picture>

    <div class="rr-hero__readout" aria-hidden="true">
      <span>PLATE 00</span>
      <span>22.5431 N</span>
      <span>114.0579 E</span>
      <span data-rr-sample-readout>FIELD / CALIBRATED</span>
    </div>

    <fieldset class="rr-fidelity" data-rr-fidelity-control>
      <legend>FIDELITY</legend>
      <div class="rr-fidelity__modes" role="group" aria-label="Field sampling fidelity">
        <button type="button" data-rr-fidelity="auto" aria-pressed="true">AUTO</button>
        <span aria-hidden="true">·</span>
        <button type="button" data-rr-fidelity="3" aria-pressed="false">III</button>
        <span aria-hidden="true">·</span>
        <button type="button" data-rr-fidelity="2" aria-pressed="false">II</button>
        <span aria-hidden="true">·</span>
        <button type="button" data-rr-fidelity="1" aria-pressed="false">I</button>
      </div>
      <output data-rr-fidelity-readout aria-live="polite">III / measuring Hz</output>
    </fieldset>

    <figure
      class="rr-hero__signature rr-signature"
      data-rr-calligraphy
      role="img"
      aria-labelledby="rr-name-readable"
    >
      <span id="rr-name-readable" class="rr-visually-hidden">阎光锋，繁体书法签名为閻光鋒</span>
      <img
        class="rr-signature__glyph rr-signature__glyph--yan"
        data-rr-glyph="yan"
        data-rr-calligraphy-char="yan"
        src="{{ '/assets/img/renaissance-rhizome/name-yan-extracted.png' | relative_url }}"
        alt=""
        width="764"
        height="996"
        fetchpriority="high"
        decoding="async"
      >
      <img
        class="rr-signature__glyph rr-signature__glyph--guang"
        data-rr-glyph="guang"
        data-rr-calligraphy-char="guang"
        src="{{ '/assets/img/renaissance-rhizome/name-guang-extracted.png' | relative_url }}"
        alt=""
        width="848"
        height="1024"
        fetchpriority="high"
        decoding="async"
      >
      <img
        class="rr-signature__glyph rr-signature__glyph--feng"
        data-rr-glyph="feng"
        data-rr-calligraphy-char="feng"
        src="{{ '/assets/img/renaissance-rhizome/name-feng-extracted.png' | relative_url }}"
        alt=""
        width="920"
        height="1136"
        fetchpriority="high"
        decoding="async"
      >
      <img
        class="rr-signature__composite"
        src="{{ '/assets/img/renaissance-rhizome/name-calligraphy.png' | relative_url }}"
        alt=""
        width="865"
        height="2806"
        fetchpriority="high"
        decoding="async"
      >
    </figure>

    <div class="rr-hero__identity">
      <p class="rr-instrument-label">Hero / Dark Instrument / Session 01</p>
      <h1 id="rr-hero-title" class="rr-hero__title">
        <span class="rr-visually-hidden">阎光锋</span>
        <span class="rr-hero__wordmark" aria-hidden="true">Virginids</span>
      </h1>
      <p class="rr-hero__lede">
        深圳大学金融科技学生。沿运筹学、控制理论与自适应动态学习追踪自动驾驶和复杂学习系统中的决策、误差与反馈。
      </p>
      <dl class="rr-hero__index" aria-label="身份与研究坐标">
        <div>
          <dt>LOC</dt>
          <dd>Shenzhen</dd>
        </div>
        <div>
          <dt>FIELD</dt>
          <dd>FinTech / Control</dd>
        </div>
        <div>
          <dt>STATE</dt>
          <dd>Research in motion</dd>
        </div>
      </dl>
      <nav class="rr-hero__anchors" aria-label="Homepage chapters">
        <a href="{{ '/projects/' | relative_url }}">Projects <span aria-hidden="true">↘</span></a>
        <a href="#translation-archive">Archive <span aria-hidden="true">↓</span></a>
        <a href="#contact">Contact <span aria-hidden="true">↗</span></a>
      </nav>
    </div>

    <div class="rr-controls" aria-label="Instrument controls">
      <button
        class="rr-control"
        type="button"
        data-rr-motion
        aria-pressed="true"
        aria-label="Turn motion off"
      >
        <span>Motion</span>
        <output aria-hidden="true">ON</output>
      </button>
      <button
        class="rr-control"
        type="button"
        data-rr-sound
        aria-pressed="false"
        aria-label="Turn sound on"
      >
        <span>Sound</span>
        <output aria-hidden="true">MUTED</output>
      </button>
      <button
        class="rr-control rr-control--tilt"
        type="button"
        data-rr-tilt
        aria-pressed="false"
        aria-label="Enable device tilt response"
      >
        <span>Tilt</span>
        <output aria-hidden="true">READY</output>
      </button>
    </div>

    <output class="rr-hero__status" data-rr-status aria-live="polite">FIELD / CALIBRATED</output>

  </section>

  <section
    id="rr-identity"
    class="rr-section rr-identity"
    data-rr-section="identity"
    aria-labelledby="rr-identity-title"
  >
    <header class="rr-section__header">
      <p class="rr-instrument-label">PLATE 01 / Identity Index</p>
      <h2 id="rr-identity-title">About <span aria-hidden="true">+</span> Skills</h2>
      <p>
        我把系统视为一组可观察、可校正的关系：状态如何形成，约束如何改变路径，反馈又如何使策略继续生长。
        研究、构建与翻译在这里分别保留自己的节奏。
      </p>
    </header>

    <dl class="rr-index" aria-label="Skills and methods">
      <div class="rr-index__row">
        <dt><span>01.1</span> Mathematical Modeling</dt>
        <dd>变量 / 约束 / 状态 / 目标函数</dd>
        <dd>把复杂问题压缩为可以检验和迭代的结构。</dd>
      </div>
      <div class="rr-index__row">
        <dt><span>01.2</span> Optimal Control</dt>
        <dd>反馈 / 动态规划 / 稳定性</dd>
        <dd>研究系统怎样在扰动与限制中更新策略。</dd>
      </div>
      <div class="rr-index__row">
        <dt><span>01.3</span> Adaptive Learning</dt>
        <dd>轨迹 / 误差 / 复习 / 响应</dd>
        <dd>让知识路径根据行为证据持续改变。</dd>
      </div>
      <div class="rr-index__row">
        <dt><span>01.4</span> Project Management</dt>
        <dd>边界 / 过程 / 证据 / 验收</dd>
        <dd>保持工作范围、决策与结果可以追溯。</dd>
      </div>
    </dl>

    <aside class="rr-identity__coordinates" aria-label="Research subjects">
      <p><span>SUBJECT A</span> 运筹学 / 控制理论</p>
      <p><span>SUBJECT B</span> 自适应动态学习 / 自动驾驶</p>
    </aside>

  </section>

  <section
    id="rhizome-learn"
    class="rr-section rr-rhizome rr-section--research"
    data-rr-section="research"
    data-rr-depth
    aria-labelledby="rr-rhizome-title"
  >
    <header class="rr-section__header">
      <p class="rr-instrument-label">PLATE 02 / Research Line / Feedback Cyan</p>
      <h2 id="rr-rhizome-title">Rhizome-Learn</h2>
      <p>
        结构化学习不从一条固定主干开始。概念、练习、错误轨迹与复习节律形成可重新进入的知识节点；
        系统依据反馈修正下一步，而不是把材料压平为单向列表。
      </p>
    </header>

    <div
      class="rr-interface"
      data-rr-readable
      data-rr-assembly="unseen"
      data-rr-assembly-kind="interface"
    >
      <figure class="rr-interface__master">
        <picture class="rr-picture">
          <source
            type="image/webp"
            srcset="{{ '/assets/img/renaissance-rhizome/rhizome-interface.webp' | relative_url }}"
          >
          <img
            src="{{ '/assets/img/renaissance-rhizome/rhizome-interface.png' | relative_url }}"
            alt="Rhizome-Learn 运行界面，显示学习节点、结构化内容与反馈轨迹"
            width="1440"
            height="1822"
            loading="lazy"
            decoding="async"
          >
        </picture>
        <figcaption>
          <span>RUNNING INTERFACE / 02.1</span>
          知识节点与自适应复习的运行界面
        </figcaption>
      </figure>

      <div class="rr-interface__fragments" aria-hidden="true">
        <picture class="rr-picture rr-interface__fragment-frame">
          <source
            type="image/webp"
            srcset="{{ '/assets/img/renaissance-rhizome/rhizome-interface.webp' | relative_url }}"
          >
          <img
            class="rr-interface__fragment"
            data-rr-fragment="research"
            data-rr-assembly-fragment
            data-rr-index="0"
            src="{{ '/assets/img/renaissance-rhizome/rhizome-interface.png' | relative_url }}"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </picture>
        <picture class="rr-picture rr-interface__fragment-frame">
          <source
            type="image/webp"
            srcset="{{ '/assets/img/renaissance-rhizome/rhizome-interface.webp' | relative_url }}"
          >
          <img
            class="rr-interface__fragment"
            data-rr-fragment="research"
            data-rr-assembly-fragment
            data-rr-index="1"
            src="{{ '/assets/img/renaissance-rhizome/rhizome-interface.png' | relative_url }}"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </picture>
        <picture class="rr-picture rr-interface__fragment-frame">
          <source
            type="image/webp"
            srcset="{{ '/assets/img/renaissance-rhizome/rhizome-interface.webp' | relative_url }}"
          >
          <img
            class="rr-interface__fragment"
            data-rr-fragment="research"
            data-rr-assembly-fragment
            data-rr-index="2"
            src="{{ '/assets/img/renaissance-rhizome/rhizome-interface.png' | relative_url }}"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </picture>
        <picture class="rr-picture rr-interface__fragment-frame">
          <source
            type="image/webp"
            srcset="{{ '/assets/img/renaissance-rhizome/rhizome-interface.webp' | relative_url }}"
          >
          <img
            class="rr-interface__fragment"
            data-rr-fragment="research"
            data-rr-assembly-fragment
            data-rr-index="3"
            src="{{ '/assets/img/renaissance-rhizome/rhizome-interface.png' | relative_url }}"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </picture>
      </div>
    </div>

    <ol class="rr-rhizome__trace" aria-label="Rhizome-Learn feedback trace">
      <li><span>02.2 / SAMPLE</span> 记录概念、练习与错误出现的位置。</li>
      <li><span>02.3 / ESTIMATE</span> 从轨迹估计理解的稳定度与遗忘风险。</li>
      <li><span>02.4 / CORRECT</span> 调整节点关系、复习节律和下一次进入路径。</li>
    </ol>

    <a
      class="rr-text-link"
      href="{{ '/projects/rhizome-learn/' | relative_url }}"
      data-rr-readable
    >
      Enter Rhizome-Learn record <span aria-hidden="true">↗</span>
    </a>

  </section>

  <section
    id="translation-archive"
    class="rr-section rr-translation rr-section--translation"
    data-rr-section="translation"
    data-rr-depth
    aria-labelledby="rr-translation-title"
  >
    <header class="rr-section__header">
      <p class="rr-instrument-label">PLATE 03 / Translation Line / Cinnabar Ink</p>
      <h2 id="rr-translation-title">Translation Projects</h2>
      <p>
        译文在术语、语境与句法之间反复校准。两册文本以不同速度进入这份档案：
        一册追踪技术与性别的开放未来，一册重新测量平台、公共基础设施与共同体。
      </p>
    </header>

    <div class="rr-translation__books">
      <article
        class="rr-book rr-book--xenofeminism"
        data-rr-book="xenofeminism"
        data-rr-assembly="unseen"
        data-rr-assembly-kind="book"
      >
        <header class="rr-book__header">
          <p>VOLUME A / XF</p>
          <h3>《陌异女性主义》</h3>
        </header>

        <figure class="rr-book__cover" data-rr-readable>
          <picture class="rr-picture">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-cover.webp' | relative_url }}"
            >
            <img
              src="{{ '/assets/img/renaissance-rhizome/pages/xf-cover.png' | relative_url }}"
              alt="《陌异女性主义》封面"
              width="875"
              height="1241"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <figcaption>完整封面 / COVER PLATE A</figcaption>
        </figure>

        <div class="rr-book__fragments" aria-hidden="true">
          <picture class="rr-picture rr-book__fragment-frame">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-cover-fragment.webp' | relative_url }}"
            >
            <img
              class="rr-book__fragment"
              data-rr-fragment="cover"
              data-rr-assembly-fragment
              data-rr-index="0"
              src="{{ '/assets/img/renaissance-rhizome/pages/xf-cover-fragment.png' | relative_url }}"
              alt=""
              width="438"
              height="621"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture class="rr-picture rr-book__fragment-frame">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-cover-fragment.webp' | relative_url }}"
            >
            <img
              class="rr-book__fragment"
              data-rr-fragment="cover"
              data-rr-assembly-fragment
              data-rr-index="1"
              src="{{ '/assets/img/renaissance-rhizome/pages/xf-cover-fragment.png' | relative_url }}"
              alt=""
              width="438"
              height="621"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture class="rr-picture rr-book__fragment-frame">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-cover-fragment.webp' | relative_url }}"
            >
            <img
              class="rr-book__fragment"
              data-rr-fragment="cover"
              data-rr-assembly-fragment
              data-rr-index="2"
              src="{{ '/assets/img/renaissance-rhizome/pages/xf-cover-fragment.png' | relative_url }}"
              alt=""
              width="438"
              height="621"
              loading="lazy"
              decoding="async"
            >
          </picture>
        </div>

        <div class="rr-page-strip" aria-label="《陌异女性主义》可读书页">
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly.webp' | relative_url }}"
            data-rr-page-title="《陌异女性主义》正文页：组装"
            data-rr-page-alt="《陌异女性主义》关于组装的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly.png' | relative_url }}"
                alt="《陌异女性主义》关于组装的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>ASSEMBLY / A.01</span>
          </a>
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback.webp' | relative_url }}"
            data-rr-page-title="《陌异女性主义》正文页：反馈"
            data-rr-page-alt="《陌异女性主义》关于反馈的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback.png' | relative_url }}"
                alt="《陌异女性主义》关于反馈的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>FEEDBACK / A.02</span>
          </a>
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/xf-future.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/xf-future.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/xf-future.webp' | relative_url }}"
            data-rr-page-title="《陌异女性主义》正文页：建构未来"
            data-rr-page-alt="《陌异女性主义》关于建构未来的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-future-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/xf-future.png' | relative_url }}"
                alt="《陌异女性主义》关于建构未来的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>FUTURE / A.03</span>
          </a>
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/xf-postscarcity.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/xf-postscarcity.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/xf-postscarcity.webp' | relative_url }}"
            data-rr-page-title="《陌异女性主义》正文页：后稀缺"
            data-rr-page-alt="《陌异女性主义》关于后稀缺的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-postscarcity-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/xf-postscarcity.png' | relative_url }}"
                alt="《陌异女性主义》关于后稀缺的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>POST-SCARCITY / A.04</span>
          </a>
        </div>
      </article>

      <article
        class="rr-book rr-book--platform"
        data-rr-book="platform-socialism"
        data-rr-assembly="unseen"
        data-rr-assembly-kind="book"
      >
        <header class="rr-book__header">
          <p>VOLUME B / PS</p>
          <h3>《平台社会主义》</h3>
        </header>

        <figure class="rr-book__cover" data-rr-readable>
          <picture class="rr-picture">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-cover.webp' | relative_url }}"
            >
            <img
              src="{{ '/assets/img/renaissance-rhizome/pages/ps-cover.png' | relative_url }}"
              alt="《平台社会主义》彩色英文封面"
              width="832"
              height="1182"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <figcaption>完整封面 / COVER PLATE B</figcaption>
        </figure>

        <div class="rr-book__fragments" aria-hidden="true">
          <picture class="rr-picture rr-book__fragment-frame">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-cover-fragment.webp' | relative_url }}"
            >
            <img
              class="rr-book__fragment"
              data-rr-fragment="cover"
              data-rr-assembly-fragment
              data-rr-index="3"
              src="{{ '/assets/img/renaissance-rhizome/pages/ps-cover-fragment.png' | relative_url }}"
              alt=""
              width="416"
              height="591"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture class="rr-picture rr-book__fragment-frame">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-cover-fragment.webp' | relative_url }}"
            >
            <img
              class="rr-book__fragment"
              data-rr-fragment="cover"
              data-rr-assembly-fragment
              data-rr-index="4"
              src="{{ '/assets/img/renaissance-rhizome/pages/ps-cover-fragment.png' | relative_url }}"
              alt=""
              width="416"
              height="591"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture class="rr-picture rr-book__fragment-frame">
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-cover-fragment.webp' | relative_url }}"
            >
            <img
              class="rr-book__fragment"
              data-rr-fragment="cover"
              data-rr-assembly-fragment
              data-rr-index="5"
              src="{{ '/assets/img/renaissance-rhizome/pages/ps-cover-fragment.png' | relative_url }}"
              alt=""
              width="416"
              height="591"
              loading="lazy"
              decoding="async"
            >
          </picture>
        </div>

        <div class="rr-page-strip" aria-label="《平台社会主义》可读书页">
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/ps-democracy.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/ps-democracy.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/ps-democracy.webp' | relative_url }}"
            data-rr-page-title="《平台社会主义》正文页：民主"
            data-rr-page-alt="《平台社会主义》关于民主的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-democracy-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/ps-democracy.png' | relative_url }}"
                alt="《平台社会主义》关于民主的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>DEMOCRACY / B.01</span>
          </a>
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/ps-commons.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/ps-commons.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/ps-commons.webp' | relative_url }}"
            data-rr-page-title="《平台社会主义》正文页：共同体"
            data-rr-page-alt="《平台社会主义》关于共同体的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-commons-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/ps-commons.png' | relative_url }}"
                alt="《平台社会主义》关于共同体的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>COMMONS / B.02</span>
          </a>
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform.webp' | relative_url }}"
            data-rr-page-title="《平台社会主义》正文页：公共平台"
            data-rr-page-alt="《平台社会主义》关于公共平台的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform.png' | relative_url }}"
                alt="《平台社会主义》关于公共平台的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>PUBLIC PLATFORM / B.03</span>
          </a>
          <a
            class="rr-page"
            href="{{ '/assets/img/renaissance-rhizome/pages/ps-infrastructure.png' | relative_url }}"
            data-rr-page-open
            data-rr-open-reader
            data-rr-page-src="{{ '/assets/img/renaissance-rhizome/pages/ps-infrastructure.png' | relative_url }}"
            data-rr-page-webp="{{ '/assets/img/renaissance-rhizome/pages/ps-infrastructure.webp' | relative_url }}"
            data-rr-page-title="《平台社会主义》正文页：基础设施"
            data-rr-page-alt="《平台社会主义》关于基础设施的正文页"
            data-rr-readable
          >
            <picture class="rr-picture">
              <source
                type="image/webp"
                srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-infrastructure-thumb.webp' | relative_url }}"
              >
              <img
                src="{{ '/assets/img/renaissance-rhizome/pages/ps-infrastructure.png' | relative_url }}"
                alt="《平台社会主义》关于基础设施的正文页"
                loading="lazy"
                decoding="async"
              >
            </picture>
            <span>INFRASTRUCTURE / B.04</span>
          </a>
        </div>
      </article>
    </div>

    <a
      class="rr-text-link"
      href="{{ '/projects/translation-projects/' | relative_url }}"
      data-rr-readable
    >
      Enter translation record <span aria-hidden="true">↗</span>
    </a>

  </section>

  <section
    id="collision-field"
    class="rr-section rr-collision rr-section--collision"
    data-rr-section="collision"
    data-rr-collision
    aria-labelledby="rr-collision-title"
  >
    <header class="rr-section__header">
      <p class="rr-instrument-label">PLATE 04 / Collision Field / Old Gold</p>
      <h2 id="rr-collision-title">FIELD / COLLISION</h2>
    </header>

    <div class="rr-collision__traces">
      <ol class="rr-collision__trace rr-collision__trace--research" aria-label="Research trace">
        <li>采样</li>
        <li>误差</li>
        <li>反馈</li>
        <li>再规划</li>
      </ol>
      <ol class="rr-collision__trace rr-collision__trace--translation" aria-label="Translation trace">
        <li>术语</li>
        <li>语境</li>
        <li>覆写</li>
        <li>再校准</li>
      </ol>
    </div>

    <div class="rr-collision__evidence-stage" data-rr-collision-evidence>
      <div class="rr-collision__evidence-viewport">
        <div class="rr-collision__evidence" data-rr-evidence-track aria-label="Visual evidence">
          <picture
            class="rr-picture rr-collision__evidence-item"
            data-rr-evidence
            data-rr-evidence-state="queued"
            role="img"
            aria-label="Rhizome-Learn 学习界面证据"
          >
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/rhizome-interface.webp' | relative_url }}"
            >
            <img
              src="{{ '/assets/img/renaissance-rhizome/rhizome-interface.png' | relative_url }}"
              alt="Rhizome-Learn 学习界面"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture
            class="rr-picture rr-collision__evidence-item"
            data-rr-evidence
            data-rr-evidence-state="queued"
            role="img"
            aria-label="《陌异女性主义》反馈正文页证据"
          >
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback.webp' | relative_url }}"
            >
            <img
              src="{{ '/assets/img/renaissance-rhizome/pages/xf-feedback.png' | relative_url }}"
              alt="《陌异女性主义》反馈正文页"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture
            class="rr-picture rr-collision__evidence-item"
            data-rr-evidence
            data-rr-evidence-state="queued"
            role="img"
            aria-label="《平台社会主义》公共平台正文页证据"
          >
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform.webp' | relative_url }}"
            >
            <img
              src="{{ '/assets/img/renaissance-rhizome/pages/ps-public-platform.png' | relative_url }}"
              alt="《平台社会主义》公共平台正文页"
              loading="lazy"
              decoding="async"
            >
          </picture>
          <picture
            class="rr-picture rr-collision__evidence-item"
            data-rr-evidence
            data-rr-evidence-state="queued"
            role="img"
            aria-label="《平台社会主义》英文封面证据"
          >
            <source
              type="image/webp"
              srcset="{{ '/assets/img/renaissance-rhizome/pages/ps-cover.webp' | relative_url }}"
            >
            <img
              src="{{ '/assets/img/renaissance-rhizome/pages/ps-cover.png' | relative_url }}"
              alt="《平台社会主义》英文封面"
              loading="lazy"
              decoding="async"
            >
          </picture>
        </div>
      </div>
    </div>

    <div class="rr-collision__release" aria-hidden="true">
      <span>OVERLOAD / 84%</span>
      <span>RELEASE / 04.9</span>
    </div>

    <div class="rr-release" aria-hidden="true">
      <p class="rr-release__mark">FIELD DECAY / 04.95 / SIGNAL CLEARED</p>
    </div>

  </section>

  <section
    id="contact"
    class="rr-section rr-contact"
    data-rr-section="contact"
    data-rr-contact
    aria-labelledby="rr-contact-title"
  >
    <svg
      class="rr-contact__network"
      viewBox="0 0 1600 520"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M-80 118 C214 36 328 292 600 174 S1044 10 1690 204"></path>
      <path d="M-120 388 C188 512 414 214 722 398 S1214 306 1710 470"></path>
      <path d="M332 -60 C498 116 254 306 490 580"></path>
      <path d="M1198 -42 C1034 158 1350 310 1136 574"></path>
    </svg>

    <header class="rr-section__header">
      <p class="rr-instrument-label">PLATE 05 / Network Exit</p>
      <h2 id="rr-contact-title">Contact</h2>
    </header>

    <address class="rr-contact__signals">
      <a
        class="rr-contact__exit"
        href="mailto:virginids301@gmail.com"
        data-rr-readable
      >
        <span>EXIT 01 / Email</span>
        <strong>virginids301@gmail.com</strong>
        <span aria-hidden="true">──────────────→</span>
      </a>
      <a
        class="rr-contact__exit"
        href="https://github.com/Virginids-Cavendish"
        rel="me"
        data-rr-readable
      >
        <span>EXIT 02 / GitHub</span>
        <strong>Virginids-Cavendish</strong>
        <span aria-hidden="true">──────────────────→</span>
      </a>
    </address>

    <nav class="rr-contact__archive" aria-label="Continue through the archive">
      <a href="{{ '/projects/' | relative_url }}">Projects</a>
      <a href="{{ '/blog/' | relative_url }}">Blog / Notes</a>
      <a href="{{ '/cv/' | relative_url }}">CV</a>
    </nav>

    <p class="rr-contact__continuation" aria-hidden="true">SIGNAL CONTINUES OUTSIDE FRAME</p>

  </section>

  <dialog
    id="rr-reader"
    class="rr-reader"
    data-rr-reader
    aria-labelledby="rr-reader-title"
  >
    <div class="rr-reader__calibration" aria-hidden="true">
      <span>READING PLATE</span>
      <span data-rr-reader-count>01 / 08</span>
    </div>
    <button
      class="rr-reader__close"
      type="button"
      data-rr-reader-close
      aria-label="Close page reader"
    >
      CLOSE <span aria-hidden="true">×</span>
    </button>
    <div class="rr-reader__cursor" data-rr-reader-cursor aria-hidden="true">
      <span class="rr-reader__cursor-glow"></span>
      <span class="rr-reader__cursor-point"></span>
    </div>
    <figure>
      <picture class="rr-picture">
        <source
          type="image/webp"
          data-rr-reader-source
          srcset="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly.webp' | relative_url }}"
        >
        <img
          data-rr-reader-image
          src="{{ '/assets/img/renaissance-rhizome/pages/xf-assembly.png' | relative_url }}"
          alt=""
        >
      </picture>
      <figcaption id="rr-reader-title" data-rr-reader-title>《陌异女性主义》正文页：组装</figcaption>
    </figure>
  </dialog>

  <div class="rr-cursor" data-rr-cursor aria-hidden="true">
    <span></span>
    <output data-rr-cursor-label>PROBE</output>
  </div>
  <div class="rr-touch-ripple" data-rr-touch-ripple aria-hidden="true"></div>

  <noscript>
    <p class="rr-noscript">STATIC PLATE / 静态档案</p>
  </noscript>
</main>

<script defer src="{{ '/assets/js/renaissance-rhizome.js' | relative_url }}"></script>
