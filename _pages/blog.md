---
layout: default
permalink: /blog/
title: Blog/Notes
nav: true
nav_order: 3
---

<link rel="stylesheet" href="{{ '/assets/css/notes-atlas.css' | relative_url }}">

<main
  class="notes-atlas notes-atlas--index"
  data-notes-atlas-root
  data-notes-scope-type="all"
  data-notes-scope-value="all"
  data-notes-graph-url="{{ '/assets/data/notes-semantic-graph.json' | relative_url }}"
>
  <header class="notes-atlas__masthead">
    <p class="notes-atlas__plate">PLATE N / CONCEPTUAL CARTOGRAPHY</p>
    <h1>Blog <span aria-hidden="true">/</span> Notes</h1>
    <p>
      文章不按日期排队。它们沿概念、项目与尚未解决的问题彼此靠近；时间只留下轻微偏移，不决定阅读从哪里开始。
    </p>
  </header>

  <section class="notes-atlas__controls" aria-label="札记图谱控制">
    <div class="notes-atlas__modes" role="group" aria-label="阅读模式">
      <button type="button" data-notes-mode="all" aria-pressed="true">
        <span>00</span>
        全部路径
      </button>
      <button type="button" data-notes-mode="research" aria-pressed="false">
        <span>R</span>
        Research
      </button>
      <button type="button" data-notes-mode="translation" aria-pressed="false">
        <span>T</span>
        Translation
      </button>
    </div>

    <form class="notes-atlas__search" role="search" data-notes-search-form>
      <label for="notes-query">全文加权搜索</label>
      <div>
        <span aria-hidden="true">⌖</span>
        <input
          id="notes-query"
          type="search"
          name="q"
          autocomplete="off"
          spellcheck="false"
          placeholder="标题、概念、标签或正文"
          data-notes-search
        >
        <output data-notes-search-status aria-live="polite">全部札记</output>
      </div>
    </form>

  </section>

  <section class="notes-atlas__graph-section" aria-labelledby="notes-graph-title">
    <header>
      <p>SEMANTIC FIELD / FIXED TOPOLOGY</p>
      <h2 id="notes-graph-title">根茎索引</h2>
      <p>实线记录全文语义关系，细线记录概念与项目关系。节点只在固定锚点附近漂移。</p>
    </header>

    <div class="notes-graph" data-notes-graph>
      <svg
        class="notes-graph__edges"
        data-notes-edge-layer
        viewBox="0 0 1000 620"
        preserveAspectRatio="none"
        aria-hidden="true"
      ></svg>

      <div class="notes-graph__nodes" data-notes-node-layer>
        {% assign atlas_posts = site.posts | where_exp: "post", "post.note_id" %}
        {% for post in atlas_posts %}
          <a
            class="notes-node notes-node--note notes-node--{{ post.note_kind }}"
            href="{{ post.url | relative_url }}"
            data-notes-node
            data-node-id="{{ post.note_id }}"
            data-note-id="{{ post.note_id }}"
            data-note-kind="{{ post.note_kind }}"
            data-tags="{{ post.tags | join: ' ' }}"
            data-categories="{{ post.categories | join: ' ' }}"
            data-concepts="{{ post.concepts | join: ' ' }}"
          >
            <span class="notes-node__index">{{ forloop.index | prepend: '0' | slice: -2, 2 }}</span>
            <strong>{{ post.title }}</strong>
            <span class="notes-node__excerpt" data-notes-excerpt>{{ post.description }}</span>
          </a>
        {% endfor %}
      </div>

      <p class="notes-graph__loading" data-notes-graph-status>TOPOLOGY / LOADING</p>
    </div>

  </section>

  <nav class="notes-atlas__facets" aria-label="标签与分类">
    <div>
      <p>CATEGORIES</p>
      <a href="{{ '/blog/category/research/' | relative_url }}">research</a>
      <a href="{{ '/blog/category/translation/' | relative_url }}">translation</a>
    </div>
    <div>
      <p>TAGS</p>
      <a href="{{ '/blog/tag/adaptive-learning/' | relative_url }}">adaptive-learning</a>
      <a href="{{ '/blog/tag/control-theory/' | relative_url }}">control-theory</a>
      <a href="{{ '/blog/tag/learner-agency/' | relative_url }}">learner-agency</a>
      <a href="{{ '/blog/tag/translation/' | relative_url }}">translation</a>
      <a href="{{ '/blog/tag/terminology/' | relative_url }}">terminology</a>
      <a href="{{ '/blog/tag/platform-politics/' | relative_url }}">platform-politics</a>
    </div>
  </nav>

  <section class="notes-index" aria-labelledby="notes-index-title">
    <header class="notes-index__header">
      <p>READABLE FALLBACK / WEIGHTED INDEX</p>
      <h2 id="notes-index-title">文字索引</h2>
    </header>

    <ol class="notes-index__list" data-notes-index>
      {% for post in atlas_posts %}
        {% assign note_tags = post.tags | join: ' ' %}
        {% assign note_categories = post.categories | join: ' ' %}
        <li
          class="notes-index__item notes-index__item--{{ post.note_kind }}"
          data-notes-index-item
          data-note-id="{{ post.note_id }}"
          data-note-kind="{{ post.note_kind }}"
          data-tags="{{ note_tags }}"
          data-categories="{{ note_categories }}"
          data-concepts="{{ post.concepts | join: ' ' }}"
        >
          <article>
            <div class="notes-index__coordinate" aria-hidden="true">
              <span>{{ forloop.index | prepend: '0' | slice: -2, 2 }}</span>
              <span>{{ post.note_kind | upcase }}</span>
            </div>
            <div class="notes-index__body">
              <h3><a href="{{ post.url | relative_url }}">{{ post.title }}</a></h3>
              <p class="notes-index__thesis">{{ post.thesis }}</p>
              <p class="notes-index__excerpt" data-notes-excerpt>{{ post.description }}</p>
              <div class="notes-index__meta">
                <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%Y.%m.%d" }}</time>
                {% for category in post.categories %}
                  <a href="{{ category | slugify | prepend: '/blog/category/' | append: '/' | relative_url }}">
                    CATEGORY / {{ category }}
                  </a>
                {% endfor %}
                {% for tag in post.tags %}
                  <a href="{{ tag | slugify | prepend: '/blog/tag/' | append: '/' | relative_url }}">#{{ tag }}</a>
                {% endfor %}
              </div>
            </div>
            <span class="notes-index__enter" aria-hidden="true">ENTER ───→</span>
          </article>
        </li>
      {% endfor %}
    </ol>

    <p class="notes-index__empty" data-notes-empty hidden>当前搜索没有命中路径。</p>

  </section>

  <noscript>
    <p class="notes-atlas__noscript">图谱漂移已停用；完整文字索引仍可直接进入每篇札记。</p>
  </noscript>
</main>

<script defer src="{{ '/assets/js/notes-atlas.js' | relative_url }}"></script>
