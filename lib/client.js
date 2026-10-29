window.__ModuleLoader__.load({
  id: "dsh-memory-neuron",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";

    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __export = (target, all) => {
      for (var name2 in all) __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if ((from && typeof from === "object") || typeof from === "function") {
        for (let key of __getOwnPropNames(from)) {
          if (!__hasOwnProp.call(to, key) && key !== except) {
            __defProp(to, key, {
              get: () => from[key],
              enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
            });
          }
        }
      }
      return to;
    };
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

    var index_exports = {};
    __export(index_exports, {
      apply: () => apply,
      inject: () => inject,
      name: () => name,
    });
    module.exports = __toCommonJS(index_exports);

    var React = require("react");
    var h = React.createElement;

    var NAME = "memory-neuron";
    var PACKAGE_ID = "dsh-memory-neuron";
    var API = "http://127.0.0.1:8318";
    var inject = ["slots"];
    var applied = false;

    var C = {
      ink: "rgba(242,230,200,.95)",
      dim: "rgba(160,143,109,.95)",
      gold: "rgba(240,217,168,.95)",
      line: "rgba(217,178,111,.22)",
      panel: "rgba(16,11,5,.72)",
    };

    function NeuronIcon(props) {
      var size = typeof props.size === "number" && props.size > 0 ? props.size : 18;
      var sw = props.active === true ? 1.7 : 1.4;
      return h(
        "svg",
        {
          viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": true, focusable: "false",
          fill: "none", stroke: "currentColor", strokeWidth: sw,
          strokeLinecap: "round", strokeLinejoin: "round", style: { display: "block" },
        },
        h("circle", { cx: "8", cy: "8", r: "2.2" }),
        h("circle", { cx: "8", cy: "8", r: "5.6", "stroke-dasharray": "1.6 1.6" }),
        h("path", { d: "M8 2.4v1.2M8 12.4v1.2M2.4 8h1.2M12.4 8h1.2" }),
      );
    }

    function fmt(n) { return (n / 1024).toFixed(1) + " KB"; }
    function hash(s) { var hh = 0; for (var i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) | 0; return hh; }

    // ---------- 球体渲染 ----------
    var ICO = (function () {
      var t = (1 + Math.sqrt(5)) / 2;
      var v = [
        [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
        [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
        [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
      ].map(function (p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; });
      var e = [];
      for (var i = 0; i < v.length; i++) for (var j = i + 1; j < v.length; j++) {
        var d = Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]);
        if (d < 1.15) e.push([i, j]);
      }
      return { v: v, e: e };
    })();

    var GEO = (function () {
      var base = ICO.v;
      var adj = base.map(function () { return []; });
      ICO.e.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
      var faces = [];
      for (var i = 0; i < base.length; i++) {
        for (var j = i + 1; j < base.length; j++) {
          if (adj[i].indexOf(j) < 0) continue;
          for (var k = j + 1; k < base.length; k++) {
            if (adj[i].indexOf(k) >= 0 && adj[j].indexOf(k) >= 0) faces.push([i, j, k]);
          }
        }
      }
      var verts = base.map(function (v) { return v.slice(); });
      var cache = {};
      function mid(a, b) {
        var key = a < b ? a + ":" + b : b + ":" + a;
        if (cache[key] !== undefined) return cache[key];
        var m = [verts[a][0] + verts[b][0], verts[a][1] + verts[b][1], verts[a][2] + verts[b][2]];
        var l = Math.hypot(m[0], m[1], m[2]) || 1;
        var idx = verts.length;
        verts.push([m[0] / l, m[1] / l, m[2] / l]);
        cache[key] = idx;
        return idx;
      }
      var tris = [];
      faces.forEach(function (f) {
        var ab = mid(f[0], f[1]), bc = mid(f[1], f[2]), ca = mid(f[2], f[0]);
        tris.push([f[0], ab, ca], [ab, f[1], bc], [ca, bc, f[2]], [ab, bc, ca]);
      });
      var seen = {}, edges = [];
      tris.forEach(function (t) {
        for (var i = 0; i < 3; i++) {
          var a = t[i], b = t[(i + 1) % 3];
          var key = a < b ? a + ":" + b : b + ":" + a;
          if (seen[key]) continue;
          seen[key] = 1;
          edges.push([a, b]);
        }
      });
      return { v: verts, e: edges };
    })();

    function buildViz(canvas, getSnap, onHover) {
      var ctx = canvas.getContext("2d");
      var W = 0, H = 0, DPR = 1;
      var yaw = 0.4, pitch = -0.16, autoSpin = true, zoom = 1;
      var nodes = [], edges = [], hot = -1, drag = null, stars = [];
      var last = 0, tmr = 0, trail = null, nextTrailAt = 0;
      var raf = 0, alive = true;

      function resize() {
        DPR = Math.min(2, window.devicePixelRatio || 1);
        W = canvas.clientWidth || 800; H = canvas.clientHeight || 600;
        canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        stars = [];
        for (var i = 0; i < 140; i++) stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.1 + 0.2, a: Math.random() * 0.5 + 0.06 });
      }

      function fibSphere(n) {
        var pts = [], ga = Math.PI * (3 - Math.sqrt(5));
        for (var i = 0; i < n; i++) {
          var y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
          var r = Math.sqrt(Math.max(0, 1 - y * y));
          var th = ga * i;
          pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
        }
        return pts;
      }

      function rebuild() {
        var snap = getSnap();
        if (!snap) return;
        nodes = []; edges = [];
        nodes.push({ label: "DSH", kind: "core", size: 15, pos: [0, 0, 0], bytes: null });
        nodes.push({ label: "交接 §〇", kind: "handoff", size: 12, pos: [0.52, 0.16, 0.2], bytes: snap.handoffBytes });
        nodes.push({ label: "身份 self-model", kind: "self", size: 9.5, pos: [-0.5, 0.22, -0.22], bytes: snap.selfModelBytes });
        var secs = (snap.sections || []).slice().sort(function (a, b) { return (b.bytes || 0) - (a.bytes || 0); });
        var pts = fibSphere(secs.length);
        secs.forEach(function (s, i) {
          var p = pts[i];
          var rr = 0.97 + Math.min(0.07, (s.bytes || 0) / 14000);
          var size = 5 + Math.min(9, Math.sqrt((s.bytes || 120) / 75));
          nodes.push({ label: s.name, kind: "fact", size: size, pos: [p[0] * rr, p[1] * rr * 0.95, p[2] * rr], bytes: s.bytes, count: s.lines });
        });
        for (var i = 1; i < nodes.length; i++) edges.push([0, i, 0.9, (hash("e" + i) % 200) / 200]);
        edges.push([1, 2, 0.6, 0.4]);
        for (var a = 3; a < nodes.length; a++) {
          for (var b = a + 1; b < nodes.length; b++) {
            var pa = nodes[a].pos, pb = nodes[b].pos;
            var d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
            if (d < 0.62) edges.push([a, b, 0.12 + 0.3 * (1 - d / 0.62), (hash(a + ":" + b) % 200) / 200]);
          }
        }
      }

      function rot(p) {
        var cy = Math.cos(yaw), sy = Math.sin(yaw);
        var X = p[0] * cy - p[2] * sy, Z = p[0] * sy + p[2] * cy;
        var cp = Math.cos(pitch), sp = Math.sin(pitch);
        var Y = p[1] * cp - Z * sp;
        Z = p[1] * sp + Z * cp;
        return [X, Y, Z];
      }

      function project(p) {
        var base = Math.min(W, H) * 0.40 * zoom;
        var f = 2.05, s = f / (f + p[2]);
        var CX = W * 0.42;
        return { x: CX + p[0] * base * s, y: H / 2 + p[1] * base * s, s: s, z: p[2] };
      }

      function drawGrid(R, alpha) {
        ctx.lineWidth = 0.4;
        ctx.strokeStyle = "rgba(240,217,168," + alpha + ")";
        for (var lat = -60; lat <= 60; lat += 30) {
          var ph = lat * Math.PI / 180, cy = Math.sin(ph), rr = Math.cos(ph);
          ctx.beginPath();
          for (var i = 0; i <= 64; i++) {
            var th = i / 64 * Math.PI * 2;
            var q = project(rot([Math.cos(th) * rr * R, cy * R, Math.sin(th) * rr * R]));
            i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
          }
          ctx.stroke();
        }
        for (var k = 0; k < 8; k++) {
          var th2 = k / 8 * Math.PI * 2;
          ctx.beginPath();
          for (var j = 0; j <= 40; j++) {
            var ph2 = (j / 40 - 0.5) * Math.PI;
            var q2 = project(rot([Math.cos(ph2) * Math.cos(th2) * R, Math.sin(ph2) * R, Math.cos(ph2) * Math.sin(th2) * R]));
            j ? ctx.lineTo(q2.x, q2.y) : ctx.moveTo(q2.x, q2.y);
          }
          ctx.stroke();
        }
      }

      var SPHERE_STARS = null;
      function drawSphereStars(R) {
        if (!SPHERE_STARS) {
          SPHERE_STARS = [];
          for (var i = 0; i < 80; i++) {
            var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
            SPHERE_STARS.push({ p: [Math.cos(th) * rr, u, Math.sin(th) * rr], m: Math.random() });
          }
        }
        SPHERE_STARS.forEach(function (st) {
          var q = project(rot([st.p[0] * R, st.p[1] * R, st.p[2] * R]));
          var a = Math.max(0.06, (0.5 - q.z * 0.28)) * (0.35 + st.m * 0.65);
          ctx.beginPath(); ctx.arc(q.x, q.y, 0.5 + st.m * 1.1, 0, 7);
          ctx.fillStyle = "rgba(255,246,220," + a.toFixed(3) + ")";
          ctx.fill();
        });
      }

      var SHELL_R = 1.02;
      function drawShell(front, alphaMul, radius) {
        var R = radius || SHELL_R;
        var vs = GEO.v.map(function (v) { return project(rot([v[0] * R, v[1] * R, v[2] * R])); });
        GEO.e.forEach(function (e) {
          var A = vs[e[0]], B = vs[e[1]];
          var zm = (A.z + B.z) / 2;
          if (front ? zm < 0 : zm >= 0) return;
          var depthK = Math.max(0.15, Math.min(1, 1 - (zm + 1) / 2.4));
          var alpha = (front ? 0.42 : 0.16) * depthK * (alphaMul == null ? 1 : alphaMul);
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.lineTo(B.x, B.y);
          ctx.strokeStyle = "rgba(255,244,214," + alpha.toFixed(3) + ")";
          ctx.lineWidth = front ? 0.9 : 0.6;
          ctx.stroke();
        });
      }

      function draw(ts) {
        if (!alive) return;
        if (!last) last = ts;
        var dt = Math.min(50, ts - last);
        last = ts;
        tmr += dt;

        ctx.clearRect(0, 0, W, H);
        stars.forEach(function (s) {
          ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 7);
          ctx.fillStyle = "rgba(255,240,205," + (s.a * 0.35) + ")";
          ctx.fill();
        });

        var R0 = Math.min(W, H) * 0.40 * zoom;
        var CX0 = W * 0.42;
        var vg = ctx.createRadialGradient(CX0 - R0 * 0.42, H / 2 - R0 * 0.45, R0 * 0.05, CX0, H / 2, R0 * 1.12);
        vg.addColorStop(0, "rgba(255,244,214,.055)");
        vg.addColorStop(0.55, "rgba(220,180,110,.022)");
        vg.addColorStop(1, "rgba(120,90,40,0)");
        ctx.fillStyle = vg;
        ctx.beginPath(); ctx.arc(CX0, H / 2, R0 * 1.12, 0, 7); ctx.fill();

        ctx.beginPath(); ctx.arc(CX0, H / 2, R0 * 1.02, 0, 7);
        ctx.strokeStyle = "rgba(255,240,205,.05)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        drawGrid(0.88, 0.030);
        drawSphereStars(1.0);

        if (autoSpin && !drag) yaw += dt * 0.00005;
        if (trail) {
          trail.t += dt / trail.dur;
          if (trail.t >= 1.15) { trail = null; nextTrailAt = tmr + 90 + Math.random() * 260; }
        } else if (tmr > nextTrailAt && edges.length) {
          trail = { e: edges[(Math.random() * edges.length) | 0], t: 0, dur: 320 + Math.random() * 260 };
        }

        var pr = nodes.map(function (n) { return project(rot(n.pos)); });

        if (pr[0]) {
          var c0 = pr[0], rad0 = Math.min(W, H) * 0.28;
          var g0 = ctx.createRadialGradient(c0.x, c0.y, 1, c0.x, c0.y, rad0);
          g0.addColorStop(0, "rgba(255,238,200,.16)");
          g0.addColorStop(0.35, "rgba(230,190,120,.06)");
          g0.addColorStop(1, "rgba(230,190,120,0)");
          ctx.fillStyle = g0;
          ctx.beginPath(); ctx.arc(c0.x, c0.y, rad0, 0, 7); ctx.fill();
        }

        drawShell(false, 1, SHELL_R);
        drawShell(false, 0.35, SHELL_R * 1.14);

        var sorted = edges.slice().sort(function (a, b) {
          return (pr[b[0]].z + pr[b[1]].z) - (pr[a[0]].z + pr[a[1]].z);
        });
        sorted.forEach(function (e) {
          var A = pr[e[0]], B = pr[e[1]];
          var depth = (A.z + B.z) / 2;
          var alpha = Math.max(0.05, (0.5 - depth * 0.28) * e[2] * 1.9);
          var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
          var dx = B.x - A.x, dy = B.y - A.y;
          var len = Math.hypot(dx, dy) || 1;
          var bend = (e[3] - 0.5) * 0.35 * len;
          var cx = mx - dy / len * bend, cy = my + dx / len * bend;
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          ctx.quadraticCurveTo(cx, cy, B.x, B.y);
          ctx.strokeStyle = "rgba(255,240,205," + alpha.toFixed(3) + ")";
          ctx.lineWidth = e[0] === 0 ? 0.6 : 0.32;
          ctx.stroke();

          if (trail && trail.e === e) {
            for (var k = 0; k < 5; k++) {
              var t = trail.t - k * 0.035;
              if (t <= 0 || t >= 1) continue;
              var px = (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * cx + t * t * B.x;
              var py = (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * cy + t * t * B.y;
              var rr2 = (1 - k / 5) * 1.9 * A.s;
              ctx.beginPath(); ctx.arc(px, py, rr2, 0, 7);
              ctx.fillStyle = "rgba(255,248,225," + ((1 - k / 5) * 0.85 * alpha * 2.2).toFixed(3) + ")";
              ctx.fill();
            }
          }
        });

        var order = nodes.map(function (_, i) { return i; }).sort(function (a, b) { return pr[b].z - pr[a].z; });
        order.forEach(function (i) {
          var n = nodes[i], p = pr[i];
          var isHot = i === hot;
          var r = n.size * p.s * (isHot ? 1.3 : 1);
          var alpha = n.kind === "core" ? 1 : Math.max(0.12, Math.min(1, 1 - (p.z + 0.9) / 2.1));

          if (n.kind === "core") {
            var bg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.4);
            bg.addColorStop(0, "rgba(255,252,240,.95)");
            bg.addColorStop(0.25, "rgba(255,244,214,.55)");
            bg.addColorStop(1, "rgba(255,240,200,0)");
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.4, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.55, 0, 7);
            ctx.fillStyle = "rgba(255,255,250,1)"; ctx.fill();
          } else {
            var halo = r * 1.7;
            var tw = 0.85 + 0.15 * Math.sin(tmr * 0.003 + (hash(n.label) % 100));
            var hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, halo);
            hg.addColorStop(0, "rgba(255,250,232," + (0.55 * alpha * tw).toFixed(3) + ")");
            hg.addColorStop(0.35, "rgba(240,217,168," + (0.18 * alpha * tw).toFixed(3) + ")");
            hg.addColorStop(1, "rgba(240,217,168,0)");
            ctx.fillStyle = hg;
            ctx.beginPath(); ctx.arc(p.x, p.y, halo, 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.1, r * 0.42), 0, 7);
            ctx.fillStyle = "rgba(255,255,248," + (0.95 * alpha).toFixed(3) + ")"; ctx.fill();
          }

          if (n.kind !== "fact" || isHot || n.bytes > 700) {
            ctx.font = (n.kind === "core" ? "600 15px " : n.kind === "fact" ? "11.5px " : "13px ") + '"Segoe UI","Microsoft YaHei",sans-serif';
            ctx.textAlign = "center";
            var la = n.kind === "fact" ? (isHot ? 0.95 : 0.55 * alpha) : 0.95 * alpha;
            ctx.fillStyle = "rgba(255,248,230," + la.toFixed(2) + ")";
            ctx.fillText(n.label, p.x, p.y + (n.kind === "core" ? r * 2.4 + 14 : (n.bytes > 700 ? r + 15 : -r - 8)));
          }
        });

        drawShell(true, 1, SHELL_R);

        if (pr[0]) {
          var tt = (ts % 3000) / 3000;
          var rrr = 22 + tt * 80;
          ctx.beginPath(); ctx.arc(pr[0].x, pr[0].y, rrr, 0, 7);
          ctx.strokeStyle = "rgba(255,240,205," + ((1 - tt) * 0.14).toFixed(3) + ")";
          ctx.lineWidth = 1; ctx.stroke();
        }

        raf = requestAnimationFrame(draw);
      }

      function pick(mx, my) {
        var best = -1, bd = 1e9;
        nodes.forEach(function (n, i) {
          var p = project(rot(n.pos));
          var d = Math.hypot(p.x - mx, p.y - my);
          if (d < n.size * p.s * 1.9 + 8 && d < bd) { bd = d; best = i; }
        });
        return best;
      }

      function onDown(e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch }; }
      function onUp() { if (drag) { drag = null; autoSpin = true; } }
      function onMove(e) {
        if (drag) {
          yaw = drag.yaw + (e.clientX - drag.x) * 0.006;
          pitch = Math.max(-1.25, Math.min(1.25, drag.pitch + (e.clientY - drag.y) * 0.005));
          return;
        }
        hot = pick(e.clientX, e.clientY);
        if (onHover) onHover(hot >= 0 ? nodes[hot] : null, e.clientX, e.clientY);
      }
      function onWheel(e) {
        e.preventDefault();
        zoom = Math.max(0.5, Math.min(2.0, zoom * (e.deltaY > 0 ? 0.94 : 1.06)));
      }

      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", resize);

      resize();
      rebuild();
      raf = requestAnimationFrame(draw);

      return {
        update: rebuild,
        dispose: function () {
          alive = false;
          cancelAnimationFrame(raf);
          canvas.removeEventListener("pointerdown", onDown);
          window.removeEventListener("pointerup", onUp);
          canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("wheel", onWheel);
          window.removeEventListener("resize", resize);
        },
      };
    }

    // ---------- React 页面 ----------
    function NeuronPage() {
      var canvasRef = React.useRef(null);
      var vizRef = React.useRef(null);
      var s0 = React.useState(null);
      var snap = s0[0];
      var setSnap = s0[1];
      var t0 = React.useState(null);
      var tip = t0[0];
      var setTip = t0[1];

      function load() {
        fetch(API + "/api/state")
          .then(function (r) { return r.json(); })
          .then(function (j) { setSnap(j.snapshot); })
          .catch(function () { /* 8318 未就绪时保持静默 */ });
      }

      React.useEffect(function () {
        load();
        var t = setInterval(load, 30000);
        return function () { clearInterval(t); };
      }, []);

      // 数据引用：始终指向最新快照，供渲染循环实时读
      var snapRef = React.useRef(null);

      React.useEffect(function () {
        if (!canvasRef.current) return;
        var viz = buildViz(canvasRef.current, function () { return snapRef.current; }, function (n, x, y) {
          setTip(n ? { label: n.label, bytes: n.bytes, x: x, y: y } : null);
        });
        vizRef.current = viz;
        return function () { viz.dispose(); };
      }, []);

      React.useEffect(function () {
        snapRef.current = snap;
        if (vizRef.current) { vizRef.current.update(); }
      }, [snap]);

      var stats = snap
        ? "交接 " + fmt(snap.handoffBytes) + " · 事实 " + fmt(snap.memoryBytes) + " · 小节 " + snap.sections.length + " · " + (snap.healthy ? "健康" : "有超线")
        : "连接中…";

      return h(
        "div",
        { style: { position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "transparent" } },
        h("canvas", {
          ref: canvasRef,
          style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", cursor: "grab" },
        }),

        // 左下：标题 / 状态 / 图例
        h(
          "div",
          {
            style: {
              position: "absolute", left: 16, bottom: 16, padding: "12px 16px", minWidth: 240,
              background: C.panel, border: "1px solid " + C.line, borderRadius: 12, backdropFilter: "blur(10px)",
            },
          },
          h("div", { style: { fontSize: 16, fontWeight: 600, letterSpacing: 1, color: C.gold } }, "记忆神经元"),
          h("div", { style: { fontSize: 11.5, color: C.dim, marginTop: 4 } }, stats),
          h("div", { style: { fontSize: 10.5, color: C.dim, opacity: 0.55, marginTop: 2 } }, "拖动旋转 · 滚轮缩放 · 悬停查看"),
          h(
            "div",
            { style: { display: "flex", gap: 9, flexWrap: "wrap", fontSize: 11, color: C.dim, marginTop: 6 } },
            [["#fbf3dd", "DSH"], ["#f0d9a8", "交接"], ["#e8d5b0", "身份"], ["#c9a86a", "事实小节"]].map(function (pair) {
              return h(
                "span",
                { key: pair[1] },
                h("i", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: pair[0], marginRight: 4, verticalAlign: "middle" } }),
                pair[1],
              );
            }),
          ),
        ),

        // 右侧：交接全文
        h(
          "div",
          {
            style: {
              position: "absolute", right: 16, top: 16, width: "min(360px, 34%)", maxHeight: "calc(100% - 32px)",
              overflow: "auto", padding: "12px 14px", background: C.panel, border: "1px solid " + C.line,
              borderRadius: 12, backdropFilter: "blur(10px)",
            },
          },
          h("div", { style: { fontSize: 11.5, color: C.gold, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 } }, "§〇 当前交接"),
          h(
            "pre",
            { style: { margin: 0, whiteSpace: "pre-wrap", fontSize: 11.5, lineHeight: 1.6, color: C.ink, opacity: 0.92, fontFamily: "inherit" } },
            snap ? snap.handoff || "（还没写交接）" : "读取中…",
          ),
        ),

        tip
          ? h(
              "div",
              {
                style: {
                  position: "fixed", pointerEvents: "none", zIndex: 9, padding: "5px 9px", borderRadius: 7,
                  background: "rgba(20,14,6,.94)", border: "1px solid rgba(240,217,168,.45)",
                  fontSize: 11.5, color: C.gold, whiteSpace: "nowrap",
                  left: tip.x + 14, top: tip.y + 12,
                },
              },
              tip.label + (tip.bytes == null ? "" : " · " + fmt(tip.bytes)),
            )
          : null,
      );
    }

    function apply(ctx) {
      if (applied) return;
      applied = true;
      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register(
          { name: "sidebar.panellist", id: NAME, order: 21, label: function () { return "记忆神经元"; } },
          NeuronIcon,
        );
      });
      ctx.slots.inject("main", function () {
        return ctx.slots.register({ name: "main", key: NAME }, NeuronPage);
      });
    }

    return module.exports;
  },
});
