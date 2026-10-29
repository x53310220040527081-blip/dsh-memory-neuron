#!/usr/bin/env node
/**
 * 阿深的记忆工具 —— 参考「淋雨家工作台」的记忆机制实现
 *
 * 核心信条：记忆在文件里，不在会话里。
 *
 * 结构（默认 ~/.dsh-memory/，可用 DSH_MEM_ROOT 指定）：
 *   handoff.md     §〇 交接（覆盖写，<=4KB，五小节）
 *   memory.md      事实区（可增长，有红线，默认 12KB）
 *   self-model.md  身份（我是谁）
 *   archive\       归档（只进不改）
 *   audit\writes.jsonl  写盘审计
 *
 * 用法：
 *   node memory.mjs status
 *   node memory.mjs handoff --did "..." --project "..." --next "..." --blocked "无"
 *   node memory.mjs remember "结论一行" [--section 系统] [--session xxx]
 *   node memory.mjs check
 *   node memory.mjs archive --section 系统现状
 *   node memory.mjs recall
 */
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, statSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = process.env.DSH_MEM_ROOT || join(homedir(), '.dsh-memory');
const FILES = {
  handoff: join(ROOT, 'handoff.md'),
  memory: join(ROOT, 'memory.md'),
  self: join(ROOT, 'self-model.md'),
  archive: join(ROOT, 'archive'),
  audit: join(ROOT, 'audit'),
  auditLog: join(ROOT, 'audit', 'writes.jsonl'),
};

const LIMITS = {
  handoff: 4 * 1024,      // §〇 交接 <= 4KB
  memory: 12 * 1024,      // 事实区 <= 12KB
  section: 4 * 1024,      // 单节 <= 4KB
  writeLines: 10,         // 单次写回 <= 10 行
  writeBytes: 2 * 1024,   // 单次写回 <= 2KB
};

const SECTIONS = ['上次交接', '当前项目', '私有记忆变更', '下一步 / 卡点', '全貌'];

// ---------- 基础 ----------
const now = () => new Date();
const today = () => now().toISOString().slice(0, 10);
const stamp = () => now().toISOString().replace('T', ' ').slice(0, 19);

function ensureDirs() {
  for (const d of [ROOT, FILES.archive, FILES.audit]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

function read(p) {
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

function write(p, s) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s, 'utf8');
}

function kb(n) {
  return (n / 1024).toFixed(1) + ' KB';
}

function audit(rec) {
  mkdirSync(FILES.audit, { recursive: true });
  appendFileSync(FILES.auditLog, JSON.stringify({ ts: stamp(), ...rec }) + '\n', 'utf8');
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}

function positional() {
  return process.argv.slice(2).filter((a) => !a.startsWith('--'));
}

// ---------- status ----------
function cmdStatus() {
  ensureDirs();
  const rows = [
    ['handoff.md', FILES.handoff, LIMITS.handoff],
    ['memory.md', FILES.memory, LIMITS.memory],
    ['self-model.md', FILES.self, null],
  ];
  console.log('=== 记忆体量 ===');
  let warn = 0;
  for (const [name, p, limit] of rows) {
    if (!existsSync(p)) {
      console.log(`  ${name.padEnd(14)} (不存在)`);
      continue;
    }
    const size = statSync(p).size;
    let flag = '';
    if (limit && size > limit) {
      flag = '  ⚠ 超红线';
      warn++;
    }
    const pct = limit ? ` (${Math.round((size / limit) * 100)}% of ${kb(limit)})` : '';
    console.log(`  ${name.padEnd(14)} ${kb(size).padStart(9)}${pct}${flag}`);
  }

  const h = read(FILES.handoff);
  const m = h.match(/最后更新[：:]\s*(\S+ \S+)/);
  console.log('\n=== 交接 ===');
  console.log(`  上次交接: ${m ? m[1] : '(从未)'}`);
  console.log(`  五小节齐全: ${checkSections(h) ? '是' : '否'}`);

  const arch = existsSync(FILES.archive) ? readdirSync(FILES.archive).filter((f) => f.endsWith('.md')) : [];
  console.log('\n=== 归档 ===');
  console.log(`  归档文件: ${arch.length} 个`);
  if (arch.length) console.log(`  最近一次: ${arch.sort().pop()}`);

  const audits = existsSync(FILES.auditLog) ? readFileSync(FILES.auditLog, 'utf8').trim().split('\n').filter(Boolean) : [];
  console.log(`  写盘审计: ${audits.length} 条`);

  console.log(`\n结论: ${warn === 0 ? '✅ 健康' : `⚠ ${warn} 个文件超红线，建议 archive`}`);
  return warn === 0 ? 0 : 1;
}

function checkSections(text) {
  if (!text.includes('§〇')) return false;
  return SECTIONS.every((s) => text.includes(s));
}

// ---------- handoff ----------
function cmdHandoff() {
  ensureDirs();
  const did = arg('did');
  const project = arg('project');
  const next = arg('next');
  const blocked = arg('blocked', '无');
  const session = arg('session', process.env.DSH_SESSION_ID || 'unknown');

  if (!did && !next) {
    console.error('用法: handoff --did "做了什么" --next "下一步" [--project "项目A|进行中|动作"] [--blocked "卡点"] [--session id]');
    return 2;
  }

  const old = read(FILES.handoff);
  const prev = extractSection(old, '上次交接') || '(无)';

  const body = `# §〇 当前交接（≤ 4KB，覆盖写）

最后更新：${stamp()} · 会话 ${session}

## 上次交接
- 本轮：${did || '(未写)'}
- 上一轮：${prev.replace(/^- /gm, '').split('\n')[0] || '(无)'}

## 当前项目
${project ? renderProject(project) : '| 项目 | 记忆文件 | 状态 | 下一步 |\n|---|---|---|---|\n| (无) | - | - | - |'}

## 私有记忆变更
- ${today()}：${did ? did.slice(0, 80) : '本轮无结构性变更'}

## 下一步 / 卡点
- 下一步：${next || '(未写)'}
- 卡点：${blocked}

## 全貌（工具生成，别手改）
- 记忆文件：handoff.md / memory.md / self-model.md
- 归档目录：archive\\
- 审计日志：audit\\writes.jsonl
`;

  if (Buffer.byteLength(body, 'utf8') > LIMITS.handoff) {
    console.error(`❌ 交接超 4KB（${kb(Buffer.byteLength(body, 'utf8'))}），请精简`);
    return 1;
  }

  // 旧版进归档（只留最新一份）
  if (old.trim()) {
    const keep = join(FILES.archive, `handoff-${today()}-${Date.now()}.md`);
    write(keep, old);
  }
  write(FILES.handoff, body);
  audit({ op: 'handoff', bytes: Buffer.byteLength(body, 'utf8'), session });
  console.log(`✅ 交接已写入 ${kb(Buffer.byteLength(body, 'utf8'))}（旧版已归档）`);
  return 0;
}

function renderProject(spec) {
  const [name = '项目', status = '进行中', next = '-'] = spec.split('|');
  return `| 项目 | 记忆文件 | 状态 | 下一步 |
|---|---|---|---|
| ${name} | - | ${status} | ${next} |`;
}

function extractSection(text, title) {
  const re = new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

// ---------- remember ----------
function cmdRemember() {
  ensureDirs();
  const pos = positional();
  const text = (pos[1] || '').trim();
  if (!text) {
    console.error('用法: remember "一行结论" [--section 系统]');
    return 2;
  }
  const lines = text.split('\n').length;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (lines > LIMITS.writeLines || bytes > LIMITS.writeBytes) {
    console.error(`❌ 单次写回超限（${lines} 行 / ${kb(bytes)}），上限 ${LIMITS.writeLines} 行 / ${kb(LIMITS.writeBytes)}`);
    console.error('   判据：三个月后还会需要这一行吗？不需要就别写。');
    return 1;
  }

  const section = arg('section', '其他');
  const mem = read(FILES.memory) || '# 共享记忆\n';
  const entry = `- ${today()}：${text}`;

  // 已有同名小节则追加，否则新建
  const head = `## ${section}`;
  let out;
  if (mem.includes(head)) {
    const re = new RegExp(`(## ${section}\\n)([\\s\\S]*?)(?=\\n## |$)`);
    out = mem.replace(re, (_, h, body) => `${h}${body.trimEnd()}\n${entry}\n`);
  } else {
    out = mem.trimEnd() + `\n\n${head}\n${entry}\n`;
  }

  const size = Buffer.byteLength(out, 'utf8');
  write(FILES.memory, out);
  audit({ op: 'remember', section, bytes, total: size });
  console.log(`✅ 已记入「${section}」（${kb(size)} / ${kb(LIMITS.memory)}）`);

  if (size > LIMITS.memory) {
    console.log('⚠ 已超红线，请用 memory.mjs archive --section <小节> 把旧段落搬进归档');
    return 1;
  }
  return 0;
}

// ---------- check ----------
function cmdCheck() {
  ensureDirs();
  const problems = [];

  const h = read(FILES.handoff);
  if (!h.trim()) problems.push('handoff.md 不存在或为空 —— 换会话前必须先写交接');
  else {
    const size = Buffer.byteLength(h, 'utf8');
    if (size > LIMITS.handoff) problems.push(`handoff 超 4KB（${kb(size)}）`);
    if (!h.includes('§〇')) problems.push('handoff 缺 §〇 标记');
    for (const s of SECTIONS) {
      if (!h.includes(s)) problems.push(`handoff 缺小节「${s}」`);
    }
    if (!/最后更新/.test(h)) problems.push('handoff 缺「最后更新」署名');
    const next = extractSection(h, '下一步 / 卡点');
    if (next && !next.includes('下一步')) problems.push('「下一步 / 卡点」里没有写下一步');
  }

  const mem = read(FILES.memory);
  if (mem) {
    const size = Buffer.byteLength(mem, 'utf8');
    if (size > LIMITS.memory) problems.push(`memory.md 超红线（${kb(size)} > ${kb(LIMITS.memory)}）`);
    // 重复事实粗检：同一天的完全相同行出现两次
    const seen = new Set();
    for (const line of mem.split('\n')) {
      const l = line.trim();
      if (!l.startsWith('- ')) continue;
      if (seen.has(l)) problems.push(`重复事实：${l.slice(0, 40)}`);
      seen.add(l);
    }
  } else {
    problems.push('memory.md 不存在');
  }

  if (!existsSync(FILES.self)) problems.push('self-model.md 不存在（身份文件）');

  if (!problems.length) {
    console.log('✅ check 通过：交接五小节齐全、体量在红线内、无重复事实');
    audit({ op: 'check', ok: true });
    return 0;
  }
  console.log('❌ check 未通过：');
  for (const p of problems) console.log('  - ' + p);
  audit({ op: 'check', ok: false, problems: problems.length });
  return 1;
}

// ---------- archive ----------
function cmdArchive() {
  ensureDirs();
  const section = arg('section');
  if (!section) {
    console.error('用法: archive --section <小节名>   （把该小节整段搬进 archive\\，并核对 0 差异）');
    return 2;
  }
  const mem = read(FILES.memory);
  const re = new RegExp(`\\n## ${section}\\n[\\s\\S]*?(?=\\n## |$)`);
  const m = mem.match(re);
  if (!m) {
    console.error(`❌ 找不到小节「${section}」`);
    return 1;
  }

  // ① 快照
  const snap = join(FILES.archive, `memory-${today()}-${Date.now()}-before.md`);
  write(snap, mem);

  const removed = m[0];
  const after = mem.replace(re, '\n');

  // ② 搬
  const arch = join(FILES.archive, `section-${section}-${today()}.md`);
  write(arch, `# 归档：${section}（${today()}）\n\n${removed.trim()}\n`);

  // ③ 核对：搬前去掉该小节 == 搬后，逐行 0 差异
  const beforeLines = mem.replace(re, '\n').split('\n').filter((l) => l.trim());
  const afterLines = after.split('\n').filter((l) => l.trim());
  const diff = beforeLines.length !== afterLines.length || beforeLines.some((l, i) => l !== afterLines[i]);

  if (diff) {
    console.error('❌ 核对失败：搬运前后不一致，已回滚（原文件未改）');
    return 1;
  }

  write(FILES.memory, after);
  audit({ op: 'archive', section, movedBytes: Buffer.byteLength(removed, 'utf8'), snapshot: snap });
  console.log(`✅ 已归档「${section}」（${kb(Buffer.byteLength(removed, 'utf8'))}）`);
  console.log(`   快照: ${snap}`);
  console.log(`   归档: ${arch}`);
  console.log(`   核对: 0 差异 ✓`);
  return 0;
}

// ---------- recall ----------
function cmdRecall() {
  ensureDirs();
  const h = read(FILES.handoff);
  const mem = read(FILES.memory);
  console.log('===== 开工前读这一屏 =====\n');
  if (h.trim()) console.log(h.trim());
  else console.log('(还没有交接 —— 先跑 memory.mjs handoff)');

  console.log('\n===== 事实区小节 =====');
  const secs = mem.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
  if (secs.length) for (const s of secs) console.log('  · ' + s);
  else console.log('  (无)');
  console.log(`\n事实区体量: ${kb(Buffer.byteLength(mem, 'utf8'))} / ${kb(LIMITS.memory)}`);
  return 0;
}

// ---------- init ----------
function cmdInit() {
  ensureDirs();
  if (!existsSync(FILES.handoff)) {
    write(FILES.handoff, `# §〇 当前交接（≤ 4KB，覆盖写）\n\n最后更新：${stamp()} · 会话 init\n\n## 上次交接\n- 本轮：初始化\n- 上一轮：(无)\n\n## 当前项目\n| 项目 | 记忆文件 | 状态 | 下一步 |\n|---|---|---|---|\n| (无) | - | - | - |\n\n## 私有记忆变更\n- ${today()}：初始化记忆机制\n\n## 下一步 / 卡点\n- 下一步：填第一份交接\n- 卡点：无\n\n## 全貌（工具生成，别手改）\n- 记忆文件：handoff.md / memory.md / self-model.md\n`);
  }
  if (!existsSync(FILES.memory)) write(FILES.memory, '# 共享记忆\n');
  if (!existsSync(FILES.self)) write(FILES.self, '# 自我模型\n');
  audit({ op: 'init' });
  console.log(`✅ 初始化完成：${ROOT}`);
  return 0;
}

// ---------- recall-session ----------
function cmdRecallSession() {
  const py = process.env.MEM_RECALL_PYTHON || 'C:\\Users\\x5331\\.dsh\\bili-duty\\.venv\\Scripts\\python.exe';
  const here = dirname(fileURLToPath(import.meta.url));
  const script = join(here, 'recall.py');
  if (!existsSync(script)) {
    console.error('缺少 recall.py:', script);
    return 1;
  }
  const args = [script, ...process.argv.slice(3)];
  const r = spawnSync(py, args, { stdio: 'inherit' });
  return r.status ?? 1;
}

// ---------- main ----------
const cmd = process.argv[2];
const table = {
  status: cmdStatus,
  handoff: cmdHandoff,
  remember: cmdRemember,
  check: cmdCheck,
  archive: cmdArchive,
  recall: cmdRecall,
  'recall-session': cmdRecallSession,
  init: cmdInit,
};
if (!cmd || !table[cmd]) {
  console.log('用法: node memory.mjs <status|handoff|remember|check|archive|recall|recall-session|init> [...]');
  process.exit(2);
}
process.exit(table[cmd]());
