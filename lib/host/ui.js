/**
 * 记忆神经元 · 页面
 * 视觉参考：暖琥珀色知识球 —— 半透明果冻球 + 线框多面体 + 细曲线 + 彗星拖尾
 * 中心 DSH · 内环 交接/身份 · 球面 事实小节
 */
export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>记忆神经元</title>
<style>
  :root{
    --bg0:#0a0703; --bg1:#1a1206; --ink:#f2e6c8; --dim:#a08f6d;
    --amber:#f0d9a8; --gold:#d9b26f; --line:rgba(217,178,111,.22);
    --panel:rgba(16,11,5,.72);
  }
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{background:radial-gradient(1200px 800px at 50% 45%,#241a0b 0%,var(--bg1) 45%,var(--bg0) 100%);
       color:var(--ink);font:13px/1.6 "Segoe UI","Microsoft YaHei",system-ui,sans-serif;overflow:hidden}
  #sphere{position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;cursor:grab}
  #sphere.dragging{cursor:grabbing}
  .panel{position:fixed;background:var(--panel);border:1px solid var(--line);border-radius:12px;
         backdrop-filter:blur(10px);box-shadow:0 10px 40px rgba(0,0,0,.5);z-index:5}
  #head{left:16px;bottom:16px;padding:12px 16px;min-width:250px}
  #head h1{margin:0;font-size:16px;font-weight:600;letter-spacing:1px;color:var(--amber)}
  #head .st{font-size:11.5px;color:var(--dim);margin-top:4px}
  #side{top:16px;right:16px;width:262px;padding:12px;display:flex;flex-direction:column;gap:7px;max-height:calc(100vh - 32px);overflow:auto}
  #handoff{right:16px;top:16px;width:min(360px,30vw);max-height:calc(100vh - 200px);padding:12px 14px;overflow:auto}
  #handoff h2{margin:0 0 6px;font-size:11.5px;color:var(--gold);letter-spacing:1px;text-transform:uppercase}
  #handoff pre{margin:0;white-space:pre-wrap;font:11.5px/1.6 "Segoe UI",system-ui,sans-serif;color:var(--ink);opacity:.9}
  #out{right:16px;bottom:16px;width:min(360px,30vw);max-height:18vh;overflow:auto;
       display:none;padding:8px 12px;font:11px/1.5 ui-monospace,Consolas,monospace;color:var(--dim)}
  h2.t{font-size:11px;margin:0;color:var(--gold);letter-spacing:1px;text-transform:uppercase}
  input,textarea{width:100%;background:rgba(30,22,10,.75);border:1px solid var(--line);color:var(--ink);
        border-radius:8px;padding:6px 9px;font:inherit;font-size:12px}
  input::placeholder,textarea::placeholder{color:#7d6d4f}
  textarea{min-height:44px;resize:vertical}
  button{background:linear-gradient(180deg,rgba(70,52,22,.9),rgba(40,29,12,.9));border:1px solid rgba(217,178,111,.35);
         color:var(--amber);padding:5px 11px;border-radius:8px;cursor:pointer;font:inherit;font-size:12px}
  button:hover{border-color:var(--gold);box-shadow:0 0 14px rgba(240,217,168,.22)}
  button.ghost{color:var(--dim);border-color:var(--line)}
  .btns{display:flex;gap:6px;flex-wrap:wrap}
  .legend{display:flex;gap:9px;flex-wrap:wrap;font-size:11px;color:var(--dim);margin-top:6px}
  .legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle}
  #tip{position:fixed;pointer-events:none;display:none;z-index:9;padding:5px 9px;border-radius:7px;
       background:rgba(20,14,6,.94);border:1px solid rgba(240,217,168,.45);font-size:11.5px;color:var(--amber);white-space:nowrap}
</style>
</head>
<body>
<canvas id="sphere"></canvas>
<div id="tip"></div>

<div class="panel" id="head">
  <h1>记忆神经元</h1>
  <div class="st" id="stat">连接中…</div>
  <div class="st" style="opacity:.55;font-size:10.5px">拖动旋转 · 滚轮缩放 · 悬停查看</div>
  <div class="legend">
    <span><i style="background:#fbf3dd"></i>DSH</span>
    <span><i style="background:#f0d9a8"></i>交接</span>
    <span><i style="background:#e8d5b0"></i>身份</span>
    <span><i style="background:#c9a86a"></i>事实小节</span>
  </div>
</div>

<div class="panel" id="handoff"><h2>§〇 当前交接</h2><pre id="ho">读取中…</pre></div>
<div class="panel" id="out"><pre id="outTxt" style="margin:0;white-space:pre-wrap"></pre></div>

<script>
const $ = (id) => document.getElementById(id);
let SNAP = null;
const fmt = (n) => (n/1024).toFixed(1) + ' KB';
function out(t){ $('outTxt').textContent = t; $('out').style.display = 'block'; }

async function load(){
  try{
    const j = await (await fetch('/api/state')).json();
    SNAP = j.snapshot;
    const s = SNAP;
    $('stat').textContent = '交接 ' + fmt(s.handoffBytes) + ' · 事实 ' + fmt(s.memoryBytes)
      + ' · 小节 ' + s.sections.length + ' · ' + (s.healthy ? '健康' : '有超线');
    $('ho').textContent = s.handoff || '（还没写交接）';
    buildGraph();
  }catch(e){ $('stat').textContent = '连不上：' + e.message; }
}

// ================= 暖琥珀知识球 =================
const cv = $('sphere'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
let yaw = 0.32, pitch = -0.12, autoSpin = true, zoom = 1;
let nodes = [], edges = [], hot = -1, drag = null, stars = [];

// 正二十面体（线框宝石）
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],
    [0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],
    [t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1],
  ].map(p => { const l = Math.hypot(p[0],p[1],p[2]); return [p[0]/l, p[1]/l, p[2]/l]; });
  const e = [];
  for(let i=0;i<v.length;i++) for(let j=i+1;j<v.length;j++){
    const d = Math.hypot(v[i][0]-v[j][0], v[i][1]-v[j][1], v[i][2]-v[j][2]);
    if(d < 1.15) e.push([i,j]);
  }
  return { v, e };
})();

/** 球笼：正二十面体细分一次，中点归一化到球面（测地线穹顶） */
const GEO = (() => {
  const base = ICO.v;
  // 1) 找出 20 个三角面
  const adj = base.map(() => []);
  for(const [a, b] of ICO.e){ adj[a].push(b); adj[b].push(a); }
  const faces = [];
  for(let i = 0; i < base.length; i++){
    for(let j = i + 1; j < base.length; j++){
      if(!adj[i].includes(j)) continue;
      for(let k = j + 1; k < base.length; k++){
        if(adj[i].includes(k) && adj[j].includes(k)) faces.push([i, j, k]);
      }
    }
  }
  // 2) 每个三角面分成 4 个，中点投到单位球
  const verts = base.map(v => v.slice());
  const midCache = new Map();
  const mid = (a, b) => {
    const key = a < b ? a + ':' + b : b + ':' + a;
    if(midCache.has(key)) return midCache.get(key);
    const m = [verts[a][0] + verts[b][0], verts[a][1] + verts[b][1], verts[a][2] + verts[b][2]];
    const l = Math.hypot(m[0], m[1], m[2]) || 1;
    const idx = verts.length;
    verts.push([m[0]/l, m[1]/l, m[2]/l]);
    midCache.set(key, idx);
    return idx;
  };
  const tris = [];
  for(const [a, b, c] of faces){
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    tris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  // 3) 从三角面取出去重的棱
  const seen = new Set(), edges = [];
  for(const t of tris){
    for(let i = 0; i < 3; i++){
      const a = t[i], b = t[(i + 1) % 3];
      const key = a < b ? a + ':' + b : b + ':' + a;
      if(seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
    }
  }
  return { v: verts, e: edges, faces: tris.length };
})();

function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if(!stars.length){
    stars = Array.from({length: 160}, () => ({x:Math.random(), y:Math.random(), r:Math.random()*1.1+0.2, a:Math.random()*0.5+0.06}));
  }
}
window.addEventListener('resize', resize);

function fibSphere(n){
  const pts = [], ga = Math.PI * (3 - Math.sqrt(5));
  for(let i=0;i<n;i++){
    const y = n === 1 ? 0 : 1 - (i / (n-1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y*y));
    const th = ga * i;
    pts.push([Math.cos(th)*r, y, Math.sin(th)*r]);
  }
  return pts;
}

function hash(s){ let h = 0; for(let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) | 0; return h; }

function buildGraph(){
  if(!SNAP) return;
  nodes = []; edges = [];
  nodes.push({ label:'DSH', kind:'core', size:15, pos:[0,0,0], bytes:null, solid:true });
  nodes.push({ label:'交接 §〇', kind:'handoff', size:12, pos:[0.52,0.16,0.2], bytes:SNAP.handoffBytes });
  nodes.push({ label:'身份 self-model', kind:'self', size:9.5, pos:[-0.5,0.22,-0.22], bytes:SNAP.selfModelBytes });

  const secs = (SNAP.sections || []).slice().sort((a,b) => (b.bytes||0) - (a.bytes||0));
  const pts = fibSphere(secs.length);
  secs.forEach((s, i) => {
    const p = pts[i];
    const rr = 0.97 + Math.min(0.07, (s.bytes||0)/14000);
    const size = 5 + Math.min(9, Math.sqrt((s.bytes||120)/75));
    nodes.push({
      label: s.name, kind: 'fact', size,
      pos: [p[0]*rr, p[1]*rr*0.95, p[2]*rr],
      bytes: s.bytes, count: s.lines,
      wire: false,
      curve: (hash(s.name) % 100) / 100,
    });
  });

  // 中心→全部；内环互连；球面近邻
  for(let i=1;i<nodes.length;i++) edges.push([0, i, 0.9]);
  edges.push([1, 2, 0.6]);
  for(let i=3;i<nodes.length;i++){
    for(let j=i+1;j<nodes.length;j++){
      const a = nodes[i].pos, b = nodes[j].pos;
      const d = Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
      if(d < 0.62) edges.push([i, j, 0.12 + 0.3*(1 - d/0.62)]);
    }
  }
  edges.forEach((e, k) => {
    e.push((hash('e'+k) % 200) / 200);            // 曲率随机
    e.push(k % 3 === 0 ? 1 : 0);                   // 是否带箭头
  });
}

function rot(p){
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let X = p[0]*cy - p[2]*sy, Z = p[0]*sy + p[2]*cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Y = p[1]*cp - Z*sp;
  Z = p[1]*sp + Z*cp;
  return [X, Y, Z];
}

function project(p){
  const base = Math.min(W, H) * 0.40 * zoom;
  const f = 2.05, s = f / (f + p[2]);
  return { x: W/2 + p[0]*base*s, y: H/2 + p[1]*base*s, s, z: p[2] };
}

let last = 0, tmr = 0, trail = null, nextTrailAt = 0;
function draw(ts){
  if(!last) last = ts;
  const dt = Math.min(50, ts - last); last = ts; tmr += dt;

  ctx.clearRect(0, 0, W, H);

  // 星尘
  for(const s of stars){
    ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, 7);
    ctx.fillStyle = 'rgba(255,240,205,' + (s.a*0.35) + ')'; ctx.fill();
  }

  // 背景长线（远处星轨）
  ctx.save();
  ctx.strokeStyle = 'rgba(255,235,190,.05)';
  ctx.lineWidth = 1;
  for(let i=0;i<7;i++){
    const y = H * (0.12 + i*0.12);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y - H*0.06); ctx.stroke();
  }
  ctx.restore();

  if(autoSpin && !drag) yaw += dt * 0.00005;

  // 彗星拖尾：前一条跑完再发下一条
  if(trail){
    trail.t += dt / trail.dur;
    if(trail.t >= 1.15){ trail = null; nextTrailAt = tmr + 90 + Math.random() * 260; }
  } else if(tmr > nextTrailAt && edges.length){
    const e0 = edges[(Math.random() * edges.length) | 0];
    trail = { e: e0, t: 0, dur: 320 + Math.random() * 260 };   // 更快
  }

  const pr = nodes.map(n => project(rot(n.pos)));

  // 中心暖光
  if(pr[0]){
    const c = pr[0], rad = Math.min(W, H) * 0.28;
    const g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, rad);
    g.addColorStop(0, 'rgba(255,238,200,.16)');
    g.addColorStop(.35, 'rgba(230,190,120,.06)');
    g.addColorStop(1, 'rgba(230,190,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rad, 0, 7); ctx.fill();
  }

  // 球体体积感（玻璃球暗面 + 光晕）
  {
    const R0 = Math.min(W, H) * 0.40 * zoom;
    const CX0 = W * 0.42;
    const vg = ctx.createRadialGradient(CX0 - R0*0.42, H/2 - R0*0.45, R0*0.05, CX0, H/2, R0*1.12);
    vg.addColorStop(0, 'rgba(255,244,214,.055)');
    vg.addColorStop(.55, 'rgba(220,180,110,.022)');
    vg.addColorStop(1, 'rgba(120,90,40,0)');
    ctx.fillStyle = vg;
    ctx.beginPath(); ctx.arc(CX0, H/2, R0*1.12, 0, 7); ctx.fill();

    ctx.beginPath(); ctx.arc(CX0, H/2, R0*1.02, 0, 7);
    ctx.strokeStyle = 'rgba(255,240,205,.05)';
    ctx.lineWidth = 1.2; ctx.stroke();
  }

  // 星图：经纬网 + 球面星点
  drawStarGrid(0.88, 0.030);
  drawSphereStars(1.0);

  // 外壳（背面）
  drawShell(false, 1, SHELL_R);
  drawShell(false, 0.35, SHELL_R * 1.14);

  // 边：曲线 + 箭头 + 彗星拖尾
  const sorted = edges.slice().sort((a,b) => (pr[b[0]].z + pr[b[1]].z) - (pr[a[0]].z + pr[a[1]].z));
  for(const e of sorted){
    const A = pr[e[0]], B = pr[e[1]];
    const depth = (A.z + B.z)/2;
    const alpha = Math.max(0.05, (0.5 - depth*0.28) * e[2] * 1.9);

    // 曲线控制点：中点垂直偏移
    const mx = (A.x + B.x)/2, my = (A.y + B.y)/2;
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (e[3] - 0.5) * 0.35 * len;
    const cx = mx - dy/len * bend, cy = my + dx/len * bend;

    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.quadraticCurveTo(cx, cy, B.x, B.y);
    ctx.strokeStyle = 'rgba(255,240,205,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = (e[0] === 0) ? 0.6 : 0.32;
    ctx.stroke();

    // 彗星拖尾（串行：一次只有一条在跑）
    if(trail && trail.e === e){
      for(let k = 0; k < 5; k++){
        const t = trail.t - k * 0.035;
        if(t <= 0 || t >= 1) continue;
        const px = (1-t)*(1-t)*A.x + 2*(1-t)*t*cx + t*t*B.x;
        const py = (1-t)*(1-t)*A.y + 2*(1-t)*t*cy + t*t*B.y;
        const rr2 = (1 - k/5) * 1.9 * A.s;
        ctx.beginPath(); ctx.arc(px, py, rr2, 0, 7);
        ctx.fillStyle = 'rgba(255,248,225,' + ((1 - k/5) * 0.85 * alpha * 2.2).toFixed(3) + ')';
        ctx.fill();
      }
    }
  }

  // 节点
  const order = nodes.map((_, i) => i).sort((a, b) => pr[b].z - pr[a].z);
  for(const i of order){
    const n = nodes[i], p = pr[i];
    const isHot = i === hot;
    const r = n.size * p.s * (isHot ? 1.3 : 1);
    const alpha = n.kind === 'core' ? 1 : Math.max(0.12, Math.min(1, 1 - (p.z + 0.9)/2.1));

    // 外发光
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r*3.6);
    g.addColorStop(0, 'rgba(255,236,190,' + (0.20*alpha) + ')');
    g.addColorStop(.45, 'rgba(230,190,120,' + (0.07*alpha) + ')');
    g.addColorStop(1, 'rgba(230,190,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r*3.6, 0, 7); ctx.fill();

    if(n.kind === 'core'){
      // 中心光点（外壳才是多面体）
      const bg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r*3.4);
      bg.addColorStop(0, 'rgba(255,252,240,.95)');
      bg.addColorStop(.25, 'rgba(255,244,214,.55)');
      bg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.x, p.y, r*3.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, r*0.55, 0, 7);
      ctx.fillStyle = 'rgba(255,255,250,1)'; ctx.fill();
    } else {
      // 光点：核心亮点 + 柔光晕（无球体轮廓）
      const tw = 0.85 + 0.15 * Math.sin(tmr * 0.003 + (hash(n.label) % 100));
      const halo = r * 1.7;
      const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
      hg.addColorStop(0, 'rgba(255,250,232,' + (0.55*alpha*tw).toFixed(3) + ')');
      hg.addColorStop(.35, 'rgba(240,217,168,' + (0.18*alpha*tw).toFixed(3) + ')');
      hg.addColorStop(1, 'rgba(240,217,168,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(p.x, p.y, halo, 0, 7); ctx.fill();

      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.1, r*0.42), 0, 7);
      ctx.fillStyle = 'rgba(255,255,248,' + (0.95*alpha).toFixed(3) + ')'; ctx.fill();
    }

    // 标签
    if(n.kind !== 'fact' || isHot || n.bytes > 700){
      ctx.font = (n.kind === 'core' ? '600 15px ' : n.kind === 'fact' ? '11.5px ' : '13px ')
        + '"Segoe UI","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      const la = n.kind === 'fact' ? (isHot ? 0.95 : 0.55 * alpha) : 0.95 * alpha;
      ctx.fillStyle = 'rgba(255,248,230,' + la.toFixed(2) + ')';
      ctx.fillText(n.label, p.x, p.y + (n.kind === 'core' ? r*2.4 + 14 : (n.bytes > 700 ? r + 15 : -r - 8)));
    }
  }

  // 外壳（正面，盖在节点上方）
  drawShell(true, 1, SHELL_R);

  // 中心呼吸环
  if(pr[0]){
    const t = (ts % 3000) / 3000;
    const rr = 22 + t * 80;
    ctx.beginPath(); ctx.arc(pr[0].x, pr[0].y, rr, 0, 7);
    ctx.strokeStyle = 'rgba(255,240,205,' + ((1 - t) * 0.14).toFixed(3) + ')';
    ctx.lineWidth = 1; ctx.stroke();
  }

  requestAnimationFrame(draw);
}

/** 星图：经纬网 */
function drawStarGrid(R, alpha){
  ctx.lineWidth = 0.4;
  ctx.strokeStyle = 'rgba(240,217,168,' + alpha + ')';
  for(let lat = -60; lat <= 60; lat += 30){
    const ph = lat * Math.PI / 180, cy = Math.sin(ph), rr = Math.cos(ph);
    ctx.beginPath();
    for(let i = 0; i <= 64; i++){
      const th = i / 64 * Math.PI * 2;
      const q = project(rot([Math.cos(th) * rr * R, cy * R, Math.sin(th) * rr * R]));
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    ctx.stroke();
  }
  for(let k = 0; k < 8; k++){
    const th = k / 8 * Math.PI * 2;
    ctx.beginPath();
    for(let i = 0; i <= 40; i++){
      const ph = (i / 40 - 0.5) * Math.PI;
      const q = project(rot([Math.cos(ph) * Math.cos(th) * R, Math.sin(ph) * R, Math.cos(ph) * Math.sin(th) * R]));
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    ctx.stroke();
  }
}

/** 星图：球面背景星点 */
let SPHERE_STARS = null;
function drawSphereStars(R){
  if(!SPHERE_STARS){
    SPHERE_STARS = Array.from({length: 80}, () => {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
      return { p: [Math.cos(th) * rr, u, Math.sin(th) * rr], m: Math.random() };
    });
  }
  for(const st of SPHERE_STARS){
    const q = project(rot([st.p[0] * R, st.p[1] * R, st.p[2] * R]));
    const a = Math.max(0.06, (0.5 - q.z * 0.28)) * (0.35 + st.m * 0.65);
    ctx.beginPath(); ctx.arc(q.x, q.y, 0.5 + st.m * 1.1, 0, 7);
    ctx.fillStyle = 'rgba(255,246,220,' + a.toFixed(3) + ')';
    ctx.fill();
  }
}

/** 星图：赤道刻度环 */
function drawEquator(R, front){
  const N = 72;
  for(let i = 0; i < N; i++){
    const th = i / N * Math.PI * 2;
    const q = project(rot([Math.cos(th) * R, 0, Math.sin(th) * R]));
    if(front ? q.z < 0 : q.z >= 0) continue;
    const long = i % 6 === 0;
    const q2 = project(rot([Math.cos(th) * R * 1.03, long ? 0.035 : 0.014, Math.sin(th) * R * 1.03]));
    const a = Math.max(0.02, 0.12 - q.z * 0.05);
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q2.x, q2.y);
    ctx.strokeStyle = 'rgba(255,246,220,' + a.toFixed(3) + ')';
    ctx.lineWidth = long ? 0.7 : 0.4;
    ctx.stroke();
  }
}

/** 外壳：包住整个球的线框多面体（半径贴近球面） */
const SHELL_R = 1.02;
function drawShell(front, alphaMul, radius){
  const R = radius || SHELL_R;
  const vs = GEO.v.map(v => project(rot([v[0]*R, v[1]*R, v[2]*R])));
  for(const [a, b] of GEO.e){
    const A = vs[a], B = vs[b];
    const zm = (A.z + B.z) / 2;
    if(front ? zm < 0 : zm >= 0) continue;
    const depthK = Math.max(0.15, Math.min(1, 1 - (zm + 1) / 2.4));
    const alpha = (front ? 0.42 : 0.16) * depthK * (alphaMul == null ? 1 : alphaMul);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = 'rgba(255,244,214,' + alpha.toFixed(3) + ')';
    ctx.lineWidth = front ? 0.9 : 0.6;
    ctx.stroke();
  }
}

function pick(mx, my){
  let best = -1, bd = 1e9;
  nodes.forEach((n, i) => {
    const p = project(rot(n.pos));
    const d = Math.hypot(p.x - mx, p.y - my);
    if(d < n.size * p.s * 1.9 + 8 && d < bd){ bd = d; best = i; }
  });
  return best;
}

cv.addEventListener('pointerdown', (e) => { drag = {x:e.clientX, y:e.clientY, yaw, pitch}; cv.classList.add('dragging'); });
window.addEventListener('pointerup', () => { if(drag){ drag = null; cv.classList.remove('dragging'); autoSpin = true; } });
window.addEventListener('pointermove', (e) => {
  if(drag){
    yaw = drag.yaw + (e.clientX - drag.x) * 0.006;
    pitch = Math.max(-1.25, Math.min(1.25, drag.pitch + (e.clientY - drag.y) * 0.005));
    return;
  }
  hot = pick(e.clientX, e.clientY);
  const tip = $('tip');
  if(hot >= 0){
    const n = nodes[hot];
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 12) + 'px';
    tip.textContent = n.label + (n.bytes == null ? '' : ' · ' + fmt(n.bytes))
      + (n.kind === 'fact' ? '' : '');
  } else tip.style.display = 'none';
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = Math.max(0.5, Math.min(2.0, zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
}, {passive:false});

resize();
setTimeout(resize, 80);
setTimeout(resize, 400);
load();
setInterval(load, 30000);
requestAnimationFrame(draw);
</script>
</body>
</html>`;
}
