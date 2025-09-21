// 第2课优化版 app.js - 搜索体验优化（修正版）
// 主要改进：修复 filterSources 报错；统一 source 归一化；更稳健的空值与大小写处理；DOM 安全检查

let raw = [], view = [], activeSource = 'all';
let searchEl, sourcesEl;

// 常用DOM选择器函数
const $ = sel => document.querySelector(sel);

// 获取主要DOM元素（注意：若脚本未使用 defer，请将本文件放在 </body> 前，或改为 DOMContentLoaded 后再 init）
const listEl = $('#list');
const emptyEl = $('#empty');
const controlsEl = $('#controls');

// 全局数据存储，用于语言切换
window.currentData = null;
window.renderWithLanguage = renderWithLanguage;

// 从URL参数获取当前语言，默认为中文
const urlParams = new URLSearchParams(location.search);
window.currentLang = urlParams.get('lang') || 'zh';

// 统一获取数据源名称：缺失时使用 'unknown'
function getSource(item) {
  const s = (item && item.source) ? String(item.source).trim() : '';
  return s || 'unknown';
}

// 安全字符串 -> 小写
function toLowerSafe(s) {
  return String(s || '').toLowerCase();
}

// 初始化应用
init();

async function init() {
  try {
    // 基础 DOM 安全检查
    if (!controlsEl || !listEl || !emptyEl) {
      console.error('❌ DOM 节点缺失，请确认 #controls、#list、#empty 是否存在且脚本加载时机正确。');
      showError('页面结构未就绪，请稍后刷新或检查脚本引入位置（建议使用 defer）。');
      return;
    }

    // 挂载控制组件
    mountControls();

    // 加载数据
    raw = await loadData();
    window.currentData = raw;

    // ✅ 修复：删除无效的 raw.filterSources(...) 调用
    // 如果需要初始化可见视图，这里直接赋值全部
    view = raw.slice();

    // 绑定事件监听器
    bind();

    // 应用筛选并渲染
    applyAndRender();

    console.log('✅ 应用初始化成功，加载了', raw.length, '篇文章');
  } catch (error) {
    console.error('❌ 应用初始化失败:', error);
    showError('应用加载失败，请刷新页面重试');
  }
}

/**
 * 加载数据文件
 * 支持GitHub Pages和本地开发环境
 */
async function loadData() {
  // 构建data.json的URL，确保在不同环境下正确工作
  let dataUrl;
  if (window.location.pathname.includes('/curated-gems/')) {
    // GitHub Pages环境
    dataUrl = window.location.origin + '/curated-gems/data.json';
  } else {
    // 本地开发环境
    dataUrl = './data.json';
  }

  // 添加时间戳防止缓存
  const response = await fetch(dataUrl + '?_=' + Date.now(), {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`数据加载失败: ${response.status}`);
  }

  return await response.json();
}

/**
 * 挂载控制组件（搜索框和筛选器）
 */
function mountControls() {
  const lang = window.currentLang || 'zh';

  // 🔍 优化后的搜索框提示文字 - 更友好、更直观
  const placeholder = lang === 'zh'
    ? '🔍 搜一搜内容...'
    : '🔍 Enter keywords to search...';

  controlsEl.innerHTML = `
    <div class="controls">
      <input id="search" placeholder="${placeholder}" autocomplete="off"/>
      <div id="sources" class="tags"></div>
    </div>
  `;

  // 获取新创建的元素引用
  searchEl = $('#search');
  sourcesEl = $('#sources');
}

/**
 * 绑定事件监听器
 */
function bind() {
  // 搜索输入事件
  searchEl.addEventListener('input', applyAndRender);

  // 数据源筛选点击事件
  sourcesEl.addEventListener('click', e => {
    const target = e.target.closest('.tag');
    if (!target) return;

    // 更新激活状态
    [...sourcesEl.children].forEach(node => node.classList.remove('active'));
    target.classList.add('active');

    // 更新激活的数据源
    activeSource = target.dataset.source;

    // 重新筛选和渲染
    applyAndRender();
  });
}

/**
 * 应用筛选条件并渲染结果
 */
function applyAndRender() {
  const query = toLowerSafe((searchEl.value || '').trim());
  const lang = window.currentLang || 'zh';

  // 统计：当前搜索条件下，各数据源可见数量
  const counts = { all: 0 };
  for (const item of raw) {
    const summaryField = lang === 'zh' ? (item.summary_zh || '') : (item.summary_en || '');
    const quoteField   = lang === 'zh' ? (item.best_quote_zh || '') : (item.best_quote_en || '');
    const titleField   = lang === 'zh' ? ((item.title_zh || item.title) || '') : (item.title || '');
    const tagsArr      = item.tags || [];

    const matchesQuery = !query ||
      toLowerSafe(titleField).includes(query) ||
      toLowerSafe(summaryField).includes(query) ||
      toLowerSafe(quoteField).includes(query) ||
      tagsArr.some(tag => toLowerSafe(tag).includes(query));

    if (matchesQuery) {
      counts.all += 1;
      const s = getSource(item);
      counts[s] = (counts[s] || 0) + 1;
    }
  }

  window.__countsForCurrentQuery = counts;

  // 筛选数据
  view = raw.filter(item => {
    const summaryField = lang === 'zh' ? (item.summary_zh || '') : (item.summary_en || '');
    const quoteField   = lang === 'zh' ? (item.best_quote_zh || '') : (item.best_quote_en || '');
    const titleField   = lang === 'zh' ? ((item.title_zh || item.title) || '') : (item.title || '');
    const tagsArr      = item.tags || [];

    // 搜索匹配检查
    const matchesQuery = !query ||
      toLowerSafe(titleField).includes(query) ||
      toLowerSafe(summaryField).includes(query) ||
      toLowerSafe(quoteField).includes(query) ||
      tagsArr.some(tag => toLowerSafe(tag).includes(query));

    // 数据源匹配检查（使用统一归一化）
    const matchesSource = activeSource === 'all' || getSource(item) === activeSource;

    return matchesQuery && matchesSource;
  });

  // 渲染结果
  render(view);

  // 彩蛋：输入 magic 试试看
  if (query === 'magic') {
    alert('✨ 哇！你发现了隐藏功能！');
  }

  // 统一列出所有源（含 'unknown'）
  const sourceSet = new Set(raw.map(getSource));
  renderSources(['all', ...sourceSet]);
}

/**
 * 渲染数据源选择器
 */
function renderSources(list) {
  const counts = window.__countsForCurrentQuery || { all: raw.length };
  const lang = window.currentLang || 'zh';

  sourcesEl.innerHTML = list.map(source => {
    const n = counts[source] || 0;

    // 友好显示：unknown -> 未知来源
    const humanText = (source === 'all')
      ? (lang === 'zh' ? `📚 全部 (${n})` : `📚 All (${n})`)
      : (source === 'unknown'
          ? (lang === 'zh' ? `✨ 未知来源 (${n})` : `✨ unknown (${n})`)
          : `✨ ${source} (${n})`);

    const isActive = source === activeSource ? 'active' : '';

    return `<span class="tag ${isActive}" data-source="${esc(source)}">${esc(humanText)}</span>`;
  }).join('');
}

/**
 * 渲染文章列表
 */
function render(items) {
  const lang = window.currentLang || 'zh';

  // 处理空结果情况
  if (!items.length) {
    listEl.innerHTML = '';

    // 😅 优化后的空结果提示 - 更友好、提供建议
    const emptyTexts = {
      zh: '😅 没有找到相关内容，换个关键词试试吧',
      en: '😅 No relevant content found, try different keywords'
    };

    emptyEl.textContent = emptyTexts[lang];
    emptyEl.classList.remove('hidden');
    return;
  }

  // 隐藏空结果提示，显示文章列表
  emptyEl.classList.add('hidden');
  listEl.innerHTML = items.map(item => card(item, lang)).join('');
}

/**
 * 语言切换时重新渲染
 */
function renderWithLanguage(items, lang) {
  // 更新当前语言
  window.currentLang = lang;

  // 更新搜索框提示文字
  const placeholder = lang === 'zh'
    ? '🔍 输入关键词搜索精彩内容...'
    : '🔍 Enter keywords to search amazing content...';

  if (searchEl) {
    searchEl.placeholder = placeholder;
  }

  // 重新应用当前筛选条件
  applyAndRender();
}

/**
 * 生成文章卡片HTML
 */
function card(item, lang = 'zh') {
  const tagsArray = lang === 'zh'
    ? (item.tags_zh || item.tags || [])
    : (item.tags || []);
  const tags = tagsArray.join(', ');
  const title = lang === 'zh'
    ? ((item.title_zh || item.title) || '')
    : (item.title || '');
  const desc = lang === 'zh'
    ? (item.summary_zh || '')
    : (item.summary_en || '');
  const quote = lang === 'zh'
    ? (item.best_quote_zh || '')
    : (item.best_quote_en || '');

  const quoteWrapper = lang === 'zh' ? '「」' : '""';
  const aiSummaryLabel = lang === 'zh' ? 'AI总结：' : 'AI Summary: ';

  return `
    <article class="card">
      <h3>
        <a href="${esc(item.link || '#')}" target="_blank" rel="noopener">
          ${esc(title)}
        </a>
      </h3>
      ${desc
        ? `<p><span class="ai-label">${aiSummaryLabel}</span>${esc(desc)}</p>`
        : ''}
      ${quote
        ? `<blockquote>${quoteWrapper[0]}${esc(quote)}${quoteWrapper[1]}</blockquote>`
        : ''}
      <div class="meta">
        ${esc(getSource(item))} · ${esc(tags)} · ${esc(item.date || '')}
      </div>
    </article>
  `;
}

/**
 * 显示错误信息
 */
function showError(message) {
  const lang = window.currentLang || 'zh';
  const errorPrefix = lang === 'zh' ? '❌ 错误：' : '❌ Error: ';

  if (listEl && emptyEl) {
    listEl.innerHTML = '';
    emptyEl.textContent = errorPrefix + message;
    emptyEl.classList.remove('hidden');
  }
}

/**
 * HTML转义函数，防止XSS攻击
 */
function esc(str) {
  return String(str || '').replace(/[&<>"']/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[match]));
}

// 调试信息
console.log('🚀 第2课优化版 app.js 已加载（修正版）');
console.log('📝 修复点：删除无效方法调用、统一 source、加强空值处理与 DOM 安全检查');
