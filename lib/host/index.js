/**
 * 记忆神经元 · 宿主半端
 *
 * 做三件事：
 *   1) 建好共享目录（neuronDir），写入说明与状态文件 —— 你和阿深都能查
 *   2) 起一个独立 HTTP 服务（默认 8318），提供可视化页面与 API
 *   3) API 内部调用 tools/memory.mjs（已实测的程序），不重复实现逻辑
 *
 * 无静态 @deepseek-ai/* 依赖：只通过 Cordis 上下文取能力，取不到也能降级运行。
 */
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './ui.js';

export const name = 'memory-neuron';
export const inject = [];
export const provide = [];

const HERE = dirname(fileURLToPath(import.meta.url));
const HOME = process.env.USERPROFILE || process.env.HOME || '.';
const DEFAULT_ROOT = join(HOME, '.dsh-memory');

const DEFAULTS = {
  // 都可以用 cordis.patch.yml 的 config 覆盖；默认值不依赖具体机器
  memoryRoot: DEFAULT_ROOT,
  neuronDir: join(DEFAULT_ROOT, 'neuron'),
  uiPort: 8318,
  nodePath: process.execPath,
  memoryTool: null,
};

function resolveConfig(config = {}) {
  // 占位符（如 <记忆根目录>）当作未配置，回到默认值
  const isPlaceholder = (v) => typeof v === 'string' && /^<.*>$/.test(v.trim());
  const given = {};
  for (const [k, v] of Object.entries(config || {})) {
    if (!isPlaceholder(v)) given[k] = v;
  }
  const cfg = { ...DEFAULTS, ...given };
  // memoryTool 顺序：显式配置 > 环境变量 > 包内 tools/ > home 下的 tools/
  const candidates = [
    cfg.memoryTool,
    process.env.MEMORY_TOOL,
    join(HERE, '..', '..', '..', 'tools', 'memory.mjs'),
    join(HOME, '.dsh-memory', 'tools', 'memory.mjs'),
  ].filter(Boolean);
  cfg.memoryTool = candidates.find((c) => { try { return existsSync(c); } catch { return false; } }) || candidates[0];
  return cfg;
}

function readText(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

function fileInfo(p) {
  try {
    const st = statSync(p);
    return { exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
  } catch {
    return { exists: false, bytes: 0, mtime: null };
  }
}

/** 调 memory.mjs 的某个子命令，返回 { ok, out } */
function runTool(cfg, args) {
  const r = spawnSync(cfg.nodePath, [cfg.memoryTool, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
    env: { ...process.env, DSH_MEM_ROOT: cfg.memoryRoot },
  });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  return { ok: (r.status ?? 1) === 0, out };
}

function ensureNeuronDir(cfg) {
  if (!existsSync(cfg.neuronDir)) mkdirSync(cfg.neuronDir, { recursive: true });
  const readme = join(cfg.neuronDir, 'README.md');
  if (!existsSync(readme)) {
    writeFileSync(
      readme,
      [
        '# 记忆神经元 · 共享目录',
        '',
        '这里是「记忆神经元」插件的工作目录，DSH 主会话与 QQ 上的阿深都能读写。',
        '',
        '| 文件 | 含义 |',
        '|---|---|',
        '| `state.json` | 插件状态（端口、路径、最近一次体检） |',
        '| `neuron.log` | 插件运行日志（追加） |',
        '',
        '记忆本体在上一层：`handoff.md`（§〇 交接）/ `memory.md`（事实）/ `self-model.md`（身份）。',
        '归档在 `../archive/`，工具在 memory.mjs（CLI 可直接跑）。',
        '',
        `生成时间：${new Date().toISOString()}`,
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

function logLine(cfg, msg) {
  try {
    mkdirSync(cfg.neuronDir, { recursive: true });
    writeFileSync(join(cfg.neuronDir, 'neuron.log'), `${new Date().toISOString()} ${msg}\n`, { flag: 'a' });
  } catch {
    /* ignore */
  }
}

function writeState(cfg, extra = {}) {
  const root = cfg.memoryRoot;
  const state = {
    name: 'memory-neuron',
    updatedAt: new Date().toISOString(),
    uiUrl: `http://127.0.0.1:${cfg.uiPort}/`,
    memoryRoot: root,
    neuronDir: cfg.neuronDir,
    memoryTool: cfg.memoryTool,
    files: {
      handoff: fileInfo(join(root, 'handoff.md')),
      memory: fileInfo(join(root, 'memory.md')),
      selfModel: fileInfo(join(root, 'self-model.md')),
    },
    archiveCount: (() => {
      try {
        return readdirSync(join(root, 'archive')).filter((f) => f.endsWith('.md')).length;
      } catch {
        return 0;
      }
    })(),
    ...extra,
  };
  writeFileSync(join(cfg.neuronDir, 'state.json'), JSON.stringify(state, null, 2), 'utf8');
  return state;
}

function snapshot(cfg) {
  const root = cfg.memoryRoot;
  const handoff = readText(join(root, 'handoff.md'));
  const memory = readText(join(root, 'memory.md'));
  const self = readText(join(root, 'self-model.md'));
  const limit = { handoff: 4096, memory: 12 * 1024 };
  // 分节 + 体量（供粒子球用：节大小 = 节点大小）
  const sections = [];
  {
    const lines = memory.split('\n');
    let cur = null;
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (cur) sections.push(cur);
        cur = { name: line.slice(3).trim(), bytes: 0, lines: 0 };
      } else if (cur) {
        cur.bytes += Buffer.byteLength(line, 'utf8') + 1;
        if (line.trim()) cur.lines += 1;
      }
    }
    if (cur) sections.push(cur);
  }
  const dir = join(root, 'archive');
  let archive = [];
  try {
    archive = readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ name: f, bytes: fileInfo(join(dir, f)).bytes }))
      .sort((a, b) => (a.name < b.name ? 1 : -1))
      .slice(0, 20);
  } catch {}
  return {
    handoff,
    handoffBytes: Buffer.byteLength(handoff, 'utf8'),
    handoffLimit: limit.handoff,
    memoryBytes: Buffer.byteLength(memory, 'utf8'),
    memoryLimit: limit.memory,
    selfModelBytes: Buffer.byteLength(self, 'utf8'),
    sections,
    archive,
    healthy: Buffer.byteLength(handoff, 'utf8') <= limit.handoff && Buffer.byteLength(memory, 'utf8') <= limit.memory,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => {
      b += c;
      if (b.length > 1e6) b = b.slice(0, 1e6);
    });
    req.on('end', () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export function apply(ctx, config) {
  const cfg = resolveConfig(config);
  ensureNeuronDir(cfg);
  logLine(cfg, `apply: root=${cfg.memoryRoot} port=${cfg.uiPort}`);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${cfg.uiPort}`);
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        const html = renderPage();
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        return json(res, 200, { ok: true, snapshot: snapshot(cfg), state: writeState(cfg) });
      }
      if (req.method === 'GET' && url.pathname === '/api/recall') {
        const r = runTool(cfg, ['recall']);
        return json(res, 200, { ok: r.ok, text: r.out });
      }
      if (req.method === 'POST' && url.pathname === '/api/handoff') {
        const b = await readBody(req);
        const args = ['handoff', '--did', String(b.did || ''), '--next', String(b.next || '')];
        if (b.project) args.push('--project', String(b.project));
        if (b.blocked) args.push('--blocked', String(b.blocked));
        const r = runTool(cfg, args);
        logLine(cfg, `handoff ok=${r.ok}`);
        return json(res, r.ok ? 200 : 500, { ok: r.ok, text: r.out, snapshot: snapshot(cfg) });
      }
      if (req.method === 'POST' && url.pathname === '/api/remember') {
        const b = await readBody(req);
        const args = ['remember', String(b.text || ''), '--section', String(b.section || '其他')];
        const r = runTool(cfg, args);
        logLine(cfg, `remember ok=${r.ok}`);
        return json(res, r.ok ? 200 : 500, { ok: r.ok, text: r.out, snapshot: snapshot(cfg) });
      }
      if (req.method === 'POST' && url.pathname === '/api/check') {
        const r = runTool(cfg, ['check']);
        logLine(cfg, `check ok=${r.ok}`);
        return json(res, 200, { ok: r.ok, text: r.out, snapshot: snapshot(cfg) });
      }
      if (req.method === 'POST' && url.pathname === '/api/archive') {
        const b = await readBody(req);
        const r = runTool(cfg, ['archive', '--section', String(b.section || '')]);
        logLine(cfg, `archive ${b.section} ok=${r.ok}`);
        return json(res, r.ok ? 200 : 500, { ok: r.ok, text: r.out, snapshot: snapshot(cfg) });
      }
      if (req.method === 'POST' && url.pathname === '/api/search') {
        const b = await readBody(req);
        const args = ['recall-session', '--q', String(b.q || ''), '--limit', String(b.limit || 10)];
        const r = runTool(cfg, args);
        return json(res, 200, { ok: r.ok, text: r.out });
      }
      json(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      json(res, 500, { ok: false, error: String(e?.message || e) });
    }
  });

  // 端口被占时重试（上一次运行的残留进程会摆一会儿）
  let listenAttempts = 0;
  const MAX_ATTEMPTS = 30;
  let retryTimer = null;

  function listenWithRetry() {
    listenAttempts += 1;
    server.listen(cfg.uiPort, '127.0.0.1', () => {
      listenAttempts = 0;
      logLine(cfg, `listening on ${cfg.uiPort}`);
      writeState(cfg, { listening: true });
      ctx?.logger?.info?.('memory-neuron: UI at http://127.0.0.1:%s/', cfg.uiPort);
    });
  }

  // 系统提示词注入：每轮带上 §〇 交接（与 QQ 侧一致）
  ctx?.inject?.(['systemPrompt'], (scoped) => {
    const sp = scoped.get('systemPrompt');
    if (!sp || typeof sp.section !== 'function') {
      logLine(cfg, 'systemPrompt unavailable');
      return;
    }
    const section = {
      name: 'memory-neuron-handoff',
      order: 30,
      interpolate: false,
      text: () => {
        try {
          const h = readText(join(cfg.memoryRoot, 'handoff.md')).trim();
          if (!h) return '';
          return '## 当前交接（记忆神经元 · 每轮注入）\n\n' + h + '\n';
        } catch {
          return '';
        }
      },
    };
    try {
      scoped.effect(() => sp.section(section), 'memory-neuron: handoff section');
      logLine(cfg, 'systemPrompt section installed');
    } catch (e) {
      logLine(cfg, 'systemPrompt section failed: ' + String(e?.message || e));
    }
  });

  server.on('error', (e) => {
    logLine(cfg, `server error (attempt ${listenAttempts}): ${e.message}`);
    if (e.code === 'EADDRINUSE' && listenAttempts < MAX_ATTEMPTS) {
      retryTimer = setTimeout(listenWithRetry, 3000);
      return;
    }
    ctx?.logger?.warn?.('memory-neuron: UI server error: %s', e.message);
  });

  listenWithRetry();

  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => () => {
      try {
        server.close();
        logLine(cfg, 'server closed');
      } catch {}
    });
  }

  return { cfg, server };
}

// 允许独立运行测试：node lib/host/index.js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { cfg } = apply({}, process.env.MN_CONFIG ? JSON.parse(process.env.MN_CONFIG) : {});
  console.log('memory-neuron standalone:', JSON.stringify({ root: cfg.memoryRoot, port: cfg.uiPort }));
}
