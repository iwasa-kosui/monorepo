import type { FileNode } from './fileTree.js';

export type TemplateOptions = Readonly<{
  title: string;
  content: string;
  wsPort: number;
}>;

export type DirectoryTemplateOptions = Readonly<{
  title: string;
  content: string;
  wsPort: number;
  fileTree: FileNode;
  currentFile?: string;
}>;

const COMMON_STYLES = `
    :root {
      --bg-color: #ffffff;
      --text-color: #24292e;
      --border-color: #e1e4e8;
      --code-bg: #f6f8fa;
      --sidebar-bg: #f6f8fa;
      --hover-bg: #e1e4e8;
      --active-bg: #0366d6;
      --active-color: #ffffff;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #0d1117;
        --text-color: #c9d1d9;
        --border-color: #30363d;
        --code-bg: #161b22;
        --sidebar-bg: #161b22;
        --hover-bg: #30363d;
        --active-bg: #58a6ff;
        --active-color: #0d1117;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background-color: var(--bg-color);
      color: var(--text-color);
    }

    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
      line-height: 1.25;
    }

    h1 { font-size: 2em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }

    p { margin-top: 0; margin-bottom: 1em; }

    a { color: #0366d6; text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 85%;
      background-color: var(--code-bg);
      padding: 0.2em 0.4em;
      border-radius: 6px;
    }

    pre {
      background-color: var(--code-bg);
      padding: 1em;
      border-radius: 6px;
      overflow-x: auto;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 85%;
    }

    .shiki,
    .shiki span {
      color: var(--shiki-light);
      background-color: var(--shiki-light-bg);
    }

    @media (prefers-color-scheme: dark) {
      .shiki,
      .shiki span {
        color: var(--shiki-dark);
        background-color: var(--shiki-dark-bg);
      }
    }

    blockquote {
      margin: 0;
      padding: 0 1em;
      color: #6a737d;
      border-left: 0.25em solid var(--border-color);
    }

    ul, ol {
      padding-left: 2em;
      margin-top: 0;
      margin-bottom: 1em;
    }

    li + li { margin-top: 0.25em; }

    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1em;
    }

    th, td {
      padding: 0.5em 1em;
      border: 1px solid var(--border-color);
    }

    th {
      background-color: var(--code-bg);
      font-weight: 600;
    }

    hr {
      border: 0;
      border-top: 1px solid var(--border-color);
      margin: 2em 0;
    }

    img {
      max-width: 100%;
      height: auto;
    }

    .mermaid {
      background: transparent;
      text-align: center;
    }

    .reload-indicator {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 5px 10px;
      background: #28a745;
      color: white;
      border-radius: 4px;
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.3s;
      z-index: 1000;
    }

    .reload-indicator.show {
      opacity: 1;
    }

    .reload-indicator.disconnected {
      background: #dc3545;
    }
`;

const WS_SCRIPT = (wsPort: number) => `
    const indicator = document.getElementById('indicator');
    let ws;
    let reconnectAttempts = 0;

    function connect() {
      ws = new WebSocket('ws://localhost:${wsPort}/ws');

      ws.onopen = () => {
        indicator.textContent = 'Connected';
        indicator.classList.remove('disconnected');
        indicator.classList.add('show');
        reconnectAttempts = 0;
        setTimeout(() => indicator.classList.remove('show'), 2000);
      };

      ws.onmessage = (event) => {
        if (event.data === 'reload') {
          indicator.textContent = 'Reloading...';
          indicator.classList.add('show');
          location.reload();
        }
      };

      ws.onclose = () => {
        indicator.textContent = 'Disconnected';
        indicator.classList.add('disconnected', 'show');
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
`;

const WS_SCRIPT_WITH_TREE_UPDATE = (wsPort: number) => `
    const indicator = document.getElementById('indicator');
    let ws;
    let reconnectAttempts = 0;

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function getCurrentFile() {
      const params = new URLSearchParams(window.location.search);
      return params.get('file') || '';
    }

    function renderFileNode(node, currentFile) {
      if (node.type === 'file') {
        const isActive = node.relativePath === currentFile;
        const activeClass = isActive ? ' active' : '';
        return '<li class="file-item' + activeClass + '">' +
          '<a href="/?file=' + encodeURIComponent(node.relativePath) + '" class="file-link" data-path="' + escapeHtml(node.relativePath) + '">' +
          '<span class="icon">📄</span>' + escapeHtml(node.name) +
          '</a></li>';
      }

      const children = (node.children || []).map(child => renderFileNode(child, currentFile)).join('');
      return '<li class="dir-item">' +
        '<details open>' +
        '<summary><span class="icon">📁</span>' + escapeHtml(node.name) + '</summary>' +
        '<ul>' + children + '</ul>' +
        '</details></li>';
    }

    async function updateFileTree() {
      try {
        const response = await fetch('/api/tree');
        const tree = await response.json();
        const currentFile = getCurrentFile();
        const treeHtml = (tree.children || []).map(child => renderFileNode(child, currentFile)).join('');
        const fileTreeEl = document.querySelector('.file-tree');
        if (fileTreeEl) {
          fileTreeEl.innerHTML = treeHtml;
        }
        const sidebarHeader = document.querySelector('.sidebar-header');
        if (sidebarHeader) {
          sidebarHeader.textContent = tree.name;
        }
        indicator.textContent = 'Tree updated';
        indicator.classList.remove('disconnected');
        indicator.classList.add('show');
        setTimeout(() => indicator.classList.remove('show'), 2000);
      } catch (e) {
        console.error('Failed to update file tree:', e);
      }
    }

    function connect() {
      ws = new WebSocket('ws://localhost:${wsPort}/ws');

      ws.onopen = () => {
        indicator.textContent = 'Connected';
        indicator.classList.remove('disconnected');
        indicator.classList.add('show');
        reconnectAttempts = 0;
        setTimeout(() => indicator.classList.remove('show'), 2000);
      };

      ws.onmessage = (event) => {
        if (event.data === 'reload') {
          indicator.textContent = 'Reloading...';
          indicator.classList.add('show');
          location.reload();
        } else if (event.data === 'tree-update') {
          updateFileTree();
        }
      };

      ws.onclose = () => {
        indicator.textContent = 'Disconnected';
        indicator.classList.add('disconnected', 'show');
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();
`;

const MERMAID_SCRIPT = `
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({
      startOnLoad: true,
      theme: isDark ? 'dark' : 'default',
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      location.reload();
    });
`;

export const renderHtml = ({ title, content, wsPort }: TemplateOptions): string =>
  `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    ${COMMON_STYLES}
    .content {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
  </style>
</head>
<body>
  <div class="reload-indicator" id="indicator">Connected</div>
  <article class="content">
    ${content}
  </article>
  <script>${WS_SCRIPT(wsPort)}</script>
  <script type="module">${MERMAID_SCRIPT}</script>
</body>
</html>`;

const renderFileTreeNode = (node: FileNode, currentFile?: string): string => {
  if (node.type === 'file') {
    const isActive = node.relativePath === currentFile;
    const activeClass = isActive ? ' active' : '';
    return `<li class="file-item${activeClass}">
      <a href="/?file=${encodeURIComponent(node.relativePath)}" class="file-link" data-path="${
      escapeHtml(node.relativePath)
    }">
        <span class="icon">📄</span>${escapeHtml(node.name)}
      </a>
    </li>`;
  }

  const children = node.children?.map((child) => renderFileTreeNode(child, currentFile)).join('') ?? '';
  return `<li class="dir-item">
    <details open>
      <summary><span class="icon">📁</span>${escapeHtml(node.name)}</summary>
      <ul>${children}</ul>
    </details>
  </li>`;
};

export const renderDirectoryHtml = ({
  title,
  content,
  wsPort,
  fileTree,
  currentFile,
}: DirectoryTemplateOptions): string => {
  const treeHtml = fileTree.children?.map((child) => renderFileTreeNode(child, currentFile)).join('') ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    ${COMMON_STYLES}

    .layout {
      display: flex;
      height: 100vh;
    }

    .sidebar {
      width: 280px;
      min-width: 280px;
      background-color: var(--sidebar-bg);
      border-right: 1px solid var(--border-color);
      overflow-y: auto;
      padding: 1rem 0;
    }

    .sidebar-header {
      padding: 0 1rem 1rem;
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--text-color);
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 0.5rem;
    }

    .file-tree {
      list-style: none;
      padding: 0;
      margin: 0;
      font-size: 0.875rem;
    }

    .file-tree ul {
      list-style: none;
      padding-left: 1rem;
      margin: 0;
    }

    .file-tree li {
      margin: 0;
    }

    .file-tree details {
      margin: 0;
    }

    .file-tree summary {
      cursor: pointer;
      padding: 0.25rem 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .file-tree summary:hover {
      background-color: var(--hover-bg);
    }

    .file-tree summary::marker {
      content: '';
    }

    .file-tree summary::-webkit-details-marker {
      display: none;
    }

    .file-link {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 1rem;
      color: var(--text-color);
      text-decoration: none;
    }

    .file-link:hover {
      background-color: var(--hover-bg);
      text-decoration: none;
    }

    .file-item.active .file-link {
      background-color: var(--active-bg);
      color: var(--active-color);
    }

    .icon {
      font-size: 1rem;
      flex-shrink: 0;
    }

    .main {
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
    }

    .content {
      max-width: 800px;
      margin: 0 auto;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #6a737d;
      font-size: 1.25rem;
    }
  </style>
</head>
<body>
  <div class="reload-indicator" id="indicator">Connected</div>
  <div class="layout">
    <nav class="sidebar">
      <div class="sidebar-header">${escapeHtml(fileTree.name)}</div>
      <ul class="file-tree">
        ${treeHtml}
      </ul>
    </nav>
    <main class="main">
      ${
    content
      ? `<article class="content">${content}</article>`
      : '<div class="empty-state">Select a file from the sidebar</div>'
  }
    </main>
  </div>
  <script>${WS_SCRIPT_WITH_TREE_UPDATE(wsPort)}</script>
  <script type="module">${MERMAID_SCRIPT}</script>
</body>
</html>`;
};

const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
