/* ภาพเคลื่อนไหวบนแผนที่: นก ผีเสื้อ หมอก บอลลูน และรถ/คนที่วิ่งตามเส้นทาง
   วาดบน canvas ที่ซ้อนอยู่บนภาพแผนที่ (อยู่ใต้หมุด จึงกดหมุดได้ตามปกติ) */
const ROUTE_TYPES = {
  car:   { label: "รถยนต์",       icon: "🚙", speed: 0.060, size: 0.034 },
  van:   { label: "รถตู้/รถบัส",  icon: "🚐", speed: 0.045, size: 0.040 },
  moto:  { label: "มอเตอร์ไซค์",  icon: "🛵", speed: 0.070, size: 0.030 },
  bike:  { label: "จักรยาน",      icon: "🚲", speed: 0.035, size: 0.028 },
  walk:  { label: "คนเดิน",       icon: "🚶", speed: 0.016, size: 0.028 },
  hike:  { label: "นักท่องเที่ยวหญิง", icon: "🚶‍♀️", speed: 0.016, size: 0.028 },
  boat:  { label: "เรือ",         icon: "🛶", speed: 0.022, size: 0.036 }
};
// ความเร็ว (คูณกับความเร็วปกติของแต่ละประเภท)
const SPEEDS = [
  { v: 0.4, t: "ช้ามาก" }, { v: 0.7, t: "ช้า" }, { v: 1, t: "ปกติ" }, { v: 1.5, t: "เร็ว" }, { v: 2.2, t: "เร็วมาก" }
];
// ขนาด (คูณกับขนาดปกติ)
const SIZES = [
  { v: 0.5, t: "เล็กมาก" }, { v: 0.75, t: "เล็ก" }, { v: 1, t: "ปกติ" }, { v: 1.3, t: "ใหญ่" }, { v: 1.7, t: "ใหญ่มาก" }
];
const DEFAULT_ANIM = { birds: true, butterflies: true, mist: true, balloons: false, routes: [] };

/* Firebase เก็บรายการซ้อนรายการไม่ได้ จึงแปลงจุด [x,y] เป็น {x,y} ก่อนบันทึก */
function animForStore(a) {
  const c = cleanAnim(a);
  return Object.assign({}, c, { routes: c.routes.map(r => Object.assign({}, r, { pts: r.pts.map(p => ({ x: p[0], y: p[1] })) })) });
}
function cleanAnim(a) {
  a = a || {};
  return {
    birds: a.birds !== false, butterflies: a.butterflies !== false, mist: a.mist !== false, balloons: !!a.balloons,
    routes: (Array.isArray(a.routes) ? a.routes : []).slice(0, 20).map(r => ({
      type: ROUTE_TYPES[r.type] ? r.type : "car",
      n: Math.max(1, Math.min(5, Math.round(+r.n || 1))),
      sp: Math.max(0.2, Math.min(3, +r.sp || 1)),
      sz: Math.max(0.3, Math.min(2, +r.sz || 1)),
      // รับได้ทั้งแบบ [x,y] (ใช้ในหน้าเว็บ) และ {x,y} (แบบที่เก็บใน Firebase)
      pts: (Array.isArray(r.pts) ? r.pts : []).slice(0, 40).map(p => {
        const x = Array.isArray(p) ? p[0] : p && p.x, y = Array.isArray(p) ? p[1] : p && p.y;
        return [Math.max(0, Math.min(100, +(+x).toFixed(1) || 0)), Math.max(0, Math.min(100, +(+y).toFixed(1) || 0))];
      })
    })).filter(r => r.pts.length >= 2)
  };
}

class MapLife {
  constructor(stage, img) {
    this.stage = stage; this.img = img; this.on = true; this.cfg = cleanAnim(DEFAULT_ANIM);
    this.cv = document.createElement("canvas"); this.cv.className = "lifecv"; this.cv.setAttribute("aria-hidden", "true");
    stage.insertBefore(this.cv, img.nextSibling);
    this.ctx = this.cv.getContext("2d");
    this.t0 = performance.now(); this.last = this.t0; this.raf = 0; this.visible = true;
    this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.fit = this.fit.bind(this); this.frame = this.frame.bind(this);
    try { new ResizeObserver(this.fit).observe(img); } catch (e) { addEventListener("resize", this.fit); }
    img.addEventListener("load", () => { this.fit(); this.build(); });
    try { new IntersectionObserver(es => { this.visible = es[0].isIntersecting; this.kick(); }).observe(stage); } catch (e) {}
    document.addEventListener("visibilitychange", () => this.kick());
    this.fit(); this.build(); this.kick();
  }
  set(cfg) { this.cfg = cleanAnim(cfg || DEFAULT_ANIM); this.build(); this.kick(); }
  setOn(v) { this.on = v; if (!v) this.clear(); this.kick(); }
  clear() { this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); }
  fit() {
    const w = this.img.clientWidth, h = this.img.clientHeight, d = Math.min(2, devicePixelRatio || 1);
    this.W = w; this.H = h;
    this.cv.style.width = w + "px"; this.cv.style.height = h + "px";
    this.cv.width = Math.round(w * d); this.cv.height = Math.round(h * d);
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  kick() {
    const run = this.on && !this.reduce && this.visible && !document.hidden && this.img.naturalWidth > 0;
    if (run && !this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
    if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }
  rnd(a, b) { return a + Math.random() * (b - a); }
  build() {
    const c = this.cfg;
    this.butterflies = c.butterflies ? Array.from({ length: 6 }, () => ({ hx: this.rnd(.2, .8), hy: this.rnd(.25, .7), ph: this.rnd(0, 6.28), sp: this.rnd(.5, 1), col: ["#f2a541", "#f6d743", "#6fb3e8", "#f28dc1", "#ffffff"][Math.floor(this.rnd(0, 5))] })) : [];
    this.mist = c.mist ? Array.from({ length: 5 }, (_, i) => ({ x: this.rnd(0, 1), y: this.rnd(.15, .6), r: this.rnd(.10, .18), sp: this.rnd(.004, .010) * (i % 2 ? 1 : -1), a: this.rnd(.18, .32) })) : [];
    this.balloons = c.balloons ? Array.from({ length: 3 }, (_, i) => ({ x: .15 + i * .3 + this.rnd(-.05, .05), y: this.rnd(.15, .45), ph: this.rnd(0, 6.28), hue: [8, 200, 45][i] })) : [];
    this.flock = null; this.nextFlock = performance.now() + 1500;
    this.movers = [];
    c.routes.forEach(r => {
      const pts = r.pts.map(p => [p[0] / 100, p[1] / 100]);
      const seg = []; let len = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); len += l; }
      const pick = a => a[Math.floor(Math.random() * a.length)];
      for (let k = 0; k < r.n; k++) this.movers.push({
        r, pts, seg, len, t: (k / r.n) * 2 + this.rnd(0, .2), ph: this.rnd(0, 6.28),
        col: pick(["#c8312b", "#1f5fae", "#e8e8ea", "#9aa3ad", "#1d1f24", "#b9862f", "#2e7d4f", "#ffffff"]),
        shirt: pick(["#d9534f", "#2f6fb5", "#f0c24b", "#3f9b62", "#f4f4f4", "#8a5cc2", "#e07b39"]),
        pants: pick(["#2c3e66", "#3b3b3b", "#6b5a45", "#1f2a44", "#7a7f87"]),
        skin: pick(["#f1c9a5", "#e0ac83", "#c98e63", "#a8714a"]),
        hair: pick(["#1b1410", "#2b1d14", "#3a2a1c", "#111"]),
        helmet: pick(["#d22f27", "#1d1f24", "#f5f5f5", "#2257a8", "#f2b134"]),
        hat: Math.random() < .5
      });
    });
  }
  posOn(m, d) { // ตำแหน่งตามระยะทาง d (0..len)
    let i = 0; while (i < m.seg.length - 1 && d > m.seg[i]) { d -= m.seg[i]; i++; }
    const f = m.seg[i] ? Math.min(1, d / m.seg[i]) : 0, a = m.pts[i], b = m.pts[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0], b[1] - a[1]];
  }
  /* ---------- วาดรถ คน และเรือแบบมีแสงเงา (หันขวาเป็นค่าเริ่มต้น) ---------- */
  shade(hex, k) { // k>0 สว่างขึ้น, k<0 เข้มขึ้น
    const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  rr(x, y, w, h, r) { const c = this.ctx; c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  wheel(x, y, r, spin) {
    const c = this.ctx;
    c.fillStyle = "#151517"; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill();
    const g = c.createRadialGradient(x - r * .2, y - r * .2, r * .05, x, y, r * .62);
    g.addColorStop(0, "#f4f6f8"); g.addColorStop(.6, "#a9b0b8"); g.addColorStop(1, "#5d646c");
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * .58, 0, 6.283); c.fill();
    c.strokeStyle = "rgba(40,44,50,.7)"; c.lineWidth = Math.max(.6, r * .1);
    for (let k = 0; k < 5; k++) { const a = spin + k * 1.2566; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55); c.stroke(); }
    c.fillStyle = "#3b3f45"; c.beginPath(); c.arc(x, y, r * .14, 0, 6.283); c.fill();
  }
  // คนเดิน: แขนขาแกว่งสลับกัน มีผม เสื้อ กางเกง รองเท้า
  person(m, h, t, opt) {
    const c = this.ctx, o = opt || {}, step = o.still ? 0 : Math.sin(t * 6.5 + m.ph);
    const hip = -h * .47, sh = -h * .78, legL = h * .47, lw = Math.max(1.6, h * .085);
    const limb = (x0, y0, len, ang, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = "round"; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.sin(ang) * len, y0 + Math.cos(ang) * len); c.stroke(); return [x0 + Math.sin(ang) * len, y0 + Math.cos(ang) * len]; };
    // ขาหลัง แขนหลัง (เข้มกว่า)
    const back = this.shade(m.pants, -.25), front = m.pants;
    if (!o.seated) {
      const f1 = limb(0, hip, legL, -step * .45, back, lw); c.fillStyle = "#222"; this.rr(f1[0] - lw * .3, f1[1] - lw * .45, lw * 1.5, lw * .9, lw * .3); c.fill();
    }
    limb(0, sh + h * .03, h * .3, step * .55, this.shade(m.skin, -.15), lw * .8);
    // ลำตัว
    const g = c.createLinearGradient(-h * .1, 0, h * .12, 0); g.addColorStop(0, this.shade(m.shirt, .15)); g.addColorStop(1, this.shade(m.shirt, -.2));
    c.fillStyle = g; this.rr(-h * .11, sh - h * .02, h * .22, h * .36, h * .07); c.fill();
    if (o.backpack) { c.fillStyle = "#6b4f2a"; this.rr(-h * .2, sh + h * .02, h * .1, h * .22, h * .03); c.fill(); }
    // ขาหน้า
    if (!o.seated) {
      const f2 = limb(0, hip, legL, step * .45, front, lw); c.fillStyle = "#111"; this.rr(f2[0] - lw * .3, f2[1] - lw * .45, lw * 1.5, lw * .9, lw * .3); c.fill();
    } else if (!o.noLeg) { const k = limb(0, hip, h * .24, 1.45, front, lw); limb(k[0], k[1], h * .22, .25, front, lw); }
    // แขนหน้า
    limb(0, sh + h * .03, h * .3, o.arm != null ? o.arm : -step * .55, m.skin, lw * .8);
    // ศีรษะ
    const hy = sh - h * .13, hr = h * .105;
    const fg = c.createRadialGradient(hr * .3, hy - hr * .3, hr * .1, 0, hy, hr * 1.1); fg.addColorStop(0, this.shade(m.skin, .15)); fg.addColorStop(1, this.shade(m.skin, -.12));
    c.fillStyle = fg; c.beginPath(); c.arc(0, hy, hr, 0, 6.283); c.fill();
    if (o.helmet) {
      const hg = c.createRadialGradient(hr * .2, hy - hr * .6, hr * .1, 0, hy - hr * .1, hr * 1.35); hg.addColorStop(0, this.shade(m.helmet, .5)); hg.addColorStop(1, this.shade(m.helmet, -.25));
      c.fillStyle = hg; c.beginPath(); c.arc(0, hy - hr * .1, hr * 1.25, Math.PI * .95, Math.PI * 2.15); c.fill();
      c.fillStyle = "rgba(40,60,80,.75)"; c.beginPath(); c.ellipse(hr * .75, hy + hr * .05, hr * .45, hr * .35, 0, 0, 6.283); c.fill();
    } else {
      c.fillStyle = m.hair; c.beginPath(); c.arc(-hr * .08, hy - hr * .15, hr * 1.02, Math.PI * .9, Math.PI * 2.05); c.fill();
      if (o.hat || m.hat && o.hatOk) { c.fillStyle = "#e9dcc0"; c.beginPath(); c.ellipse(0, hy - hr * .75, hr * 1.7, hr * .35, 0, 0, 6.283); c.fill(); this.rr(-hr * .8, hy - hr * 1.5, hr * 1.6, hr * .8, hr * .3); c.fill(); }
    }
  }
  sprite(type, s, m, t, speed) {
    const c = this.ctx, spin = t * speed * 9;
    if (type === "car") {
      const body = m.col, L = s;
      // ตัวถังล่าง
      let g = c.createLinearGradient(0, -L * .32, 0, L * .12); g.addColorStop(0, this.shade(body, .35)); g.addColorStop(.45, body); g.addColorStop(1, this.shade(body, -.45));
      c.fillStyle = g; c.beginPath();
      c.moveTo(-L * .5, -L * .05); c.quadraticCurveTo(-L * .52, -L * .2, -L * .42, -L * .23); c.lineTo(-L * .22, -L * .25);
      c.lineTo(-L * .1, -L * .42); c.quadraticCurveTo(L * .02, -L * .46, L * .16, -L * .42); c.lineTo(L * .3, -L * .26);
      c.quadraticCurveTo(L * .5, -L * .24, L * .52, -L * .12); c.lineTo(L * .52, L * .02); c.quadraticCurveTo(L * .5, L * .08, L * .44, L * .08);
      c.lineTo(-L * .46, L * .08); c.quadraticCurveTo(-L * .52, L * .06, -L * .5, -L * .05); c.fill();
      // กระจก
      g = c.createLinearGradient(0, -L * .4, 0, -L * .25); g.addColorStop(0, "#2c3b48"); g.addColorStop(1, "#8fb4c9");
      c.fillStyle = g; c.beginPath(); c.moveTo(-L * .18, -L * .26); c.lineTo(-L * .08, -L * .39); c.lineTo(L * .02, -L * .39); c.lineTo(L * .02, -L * .26); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(L * .055, -L * .26); c.lineTo(L * .055, -L * .39); c.quadraticCurveTo(L * .14, -L * .39, L * .15, -L * .38); c.lineTo(L * .25, -L * .26); c.closePath(); c.fill();
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = Math.max(.6, L * .015); c.beginPath(); c.moveTo(-L * .1, -L * .3); c.lineTo(-L * .04, -L * .37); c.stroke();
      // เส้นประตู มือจับ ไฟ
      c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = Math.max(.5, L * .01); c.beginPath(); c.moveTo(L * .035, -L * .25); c.lineTo(L * .035, L * .05); c.stroke();
      c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(-L * .08, -L * .17, L * .06, L * .02); c.fillRect(L * .11, -L * .17, L * .06, L * .02);
      c.fillStyle = "#fff7c2"; this.rr(L * .44, -L * .17, L * .07, L * .05, L * .02); c.fill();
      c.fillStyle = "#d3261f"; this.rr(-L * .51, -L * .16, L * .04, L * .05, L * .01); c.fill();
      c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(-L * .46, L * .04, L * .9, L * .03);
      this.wheel(-L * .29, L * .07, L * .1, spin); this.wheel(L * .3, L * .07, L * .1, spin);
    } else if (type === "van") {
      const body = m.col === "#1d1f24" ? "#e8e8ea" : m.col, L = s * 1.15;
      let g = c.createLinearGradient(0, -L * .55, 0, L * .1); g.addColorStop(0, this.shade(body, .4)); g.addColorStop(.5, body); g.addColorStop(1, this.shade(body, -.4));
      c.fillStyle = g; c.beginPath(); c.moveTo(-L * .5, L * .06); c.lineTo(-L * .5, -L * .46); c.quadraticCurveTo(-L * .5, -L * .52, -L * .44, -L * .52);
      c.lineTo(L * .3, -L * .52); c.quadraticCurveTo(L * .46, -L * .5, L * .5, -L * .28); c.lineTo(L * .52, L * .0); c.quadraticCurveTo(L * .52, L * .06, L * .46, L * .06); c.closePath(); c.fill();
      g = c.createLinearGradient(0, -L * .46, 0, -L * .28); g.addColorStop(0, "#2c3b48"); g.addColorStop(1, "#9cc0d4"); c.fillStyle = g;
      for (let k = 0; k < 4; k++) { this.rr(-L * .45 + k * L * .19, -L * .45, L * .15, L * .16, L * .02); c.fill(); }
      c.beginPath(); c.moveTo(L * .33, -L * .45); c.lineTo(L * .42, -L * .45); c.lineTo(L * .48, -L * .29); c.lineTo(L * .33, -L * .29); c.closePath(); c.fill();
      c.fillStyle = this.shade(body, -.3); c.fillRect(-L * .5, -L * .2, L * 1.0, L * .025);
      c.fillStyle = "#fff7c2"; this.rr(L * .46, -L * .14, L * .05, L * .05, L * .01); c.fill();
      c.fillStyle = "#d3261f"; this.rr(-L * .51, -L * .14, L * .03, L * .06, L * .01); c.fill();
      this.wheel(-L * .3, L * .06, L * .1, spin); this.wheel(L * .3, L * .06, L * .1, spin);
    } else if (type === "moto") {
      const L = s, r = L * .2, lean = Math.sin(t * 3 + m.ph) * .02;
      c.rotate(lean);
      this.wheel(-L * .32, -r * .05, r, spin); this.wheel(L * .34, -r * .05, r, spin);
      c.strokeStyle = "#555"; c.lineWidth = Math.max(1, L * .035); c.beginPath(); c.moveTo(L * .34, -r * .05); c.lineTo(L * .24, -L * .38); c.stroke();
      const g = c.createLinearGradient(0, -L * .42, 0, -L * .1); g.addColorStop(0, this.shade(m.col, .35)); g.addColorStop(1, this.shade(m.col, -.35));
      c.fillStyle = g; c.beginPath(); c.moveTo(-L * .42, -L * .2); c.quadraticCurveTo(-L * .2, -L * .36, L * .05, -L * .3); c.lineTo(L * .28, -L * .4); c.lineTo(L * .32, -L * .22); c.quadraticCurveTo(L * .1, -L * .1, -L * .3, -L * .1); c.closePath(); c.fill();
      c.fillStyle = "#1b1b1b"; this.rr(-L * .3, -L * .37, L * .3, L * .07, L * .03); c.fill();
      c.fillStyle = "#fff7c2"; c.beginPath(); c.arc(L * .3, -L * .33, L * .035, 0, 6.283); c.fill();
      c.save(); c.translate(-L * .12, L * .06); this.person(m, L * .95, t, { still: true, seated: true, helmet: true, arm: 1.05 }); c.restore();
    } else if (type === "bike") {
      const L = s, r = L * .22, pd = t * speed * 7 + m.ph;
      this.wheel(-L * .32, 0, r, spin * .7); this.wheel(L * .32, 0, r, spin * .7);
      c.strokeStyle = this.shade(m.col === "#ffffff" ? "#2f7fd8" : m.col, -.1); c.lineWidth = Math.max(1, L * .04); c.lineJoin = "round";
      c.beginPath(); c.moveTo(-L * .32, 0); c.lineTo(-L * .05, -L * .3); c.lineTo(L * .22, -L * .3); c.lineTo(L * .32, 0); c.moveTo(-L * .05, -L * .3); c.lineTo(0, 0); c.lineTo(-L * .32, 0); c.moveTo(0, 0); c.lineTo(L * .22, -L * .3); c.moveTo(L * .22, -L * .3); c.lineTo(L * .2, -L * .42); c.stroke();
      c.save(); c.translate(-L * .07, L * .14);
      const hip = -.47 * L * .95, px = L * .07 + Math.cos(pd) * L * .09, py = -L * .14 + Math.sin(pd) * L * .09;
      c.strokeStyle = this.shade(m.pants, -.25); c.lineWidth = Math.max(1.4, L * .075); c.lineCap = "round";
      c.beginPath(); c.moveTo(0, hip); c.lineTo(L * .07 - Math.cos(pd) * L * .09, -L * .14 - Math.sin(pd) * L * .09); c.stroke();
      this.person(m, L * .95, t, { still: true, seated: true, noLeg: true, arm: 1.0 });
      c.strokeStyle = m.pants; c.beginPath(); c.moveTo(0, hip); c.lineTo(px, py); c.stroke();
      c.restore();
    } else if (type === "boat") {
      const L = s * 1.3, bob = Math.sin(t * 2 + m.ph) * L * .02;
      c.translate(0, bob);
      c.strokeStyle = "rgba(255,255,255,.65)"; c.lineWidth = Math.max(.8, L * .015);
      for (let k = 1; k <= 3; k++) { const o = ((t * 1.5 + k * .33) % 1); c.globalAlpha = 1 - o; c.beginPath(); c.moveTo(-L * (.55 + o * .35), L * .08); c.lineTo(-L * (.45 + o * .35), L * .05); c.stroke(); }
      c.globalAlpha = 1;
      let g = c.createLinearGradient(0, -L * .1, 0, L * .1); g.addColorStop(0, "#a0632e"); g.addColorStop(1, "#4d2c12");
      c.fillStyle = g; c.beginPath(); c.moveTo(-L * .55, -L * .06); c.lineTo(L * .5, -L * .08); c.quadraticCurveTo(L * .62, -L * .14, L * .6, -L * .2); c.quadraticCurveTo(L * .5, L * .08, L * .3, L * .08); c.lineTo(-L * .45, L * .08); c.closePath(); c.fill();
      c.fillStyle = "#e9e1cf"; this.rr(-L * .2, -L * .3, L * .4, L * .22, L * .02); c.fill();
      c.fillStyle = "#c0392b"; c.beginPath(); c.moveTo(-L * .26, -L * .3); c.lineTo(L * .26, -L * .3); c.lineTo(L * .2, -L * .36); c.lineTo(-L * .2, -L * .36); c.closePath(); c.fill();
      c.save(); c.translate(-L * .36, L * .12); this.person(m, L * .45, t, { still: true, seated: true, arm: .9 }); c.restore();
    } else {
      this.person(m, s, t, { backpack: type === "hike", hatOk: type === "hike" });
    }
  }
  frame(now) {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const ctx = this.ctx, W = this.W, H = this.H, t = (now - this.t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    if (W && H) {
      // หมอกลอย
      for (const m of this.mist) {
        m.x += m.sp * dt; if (m.x > 1.2) m.x = -0.2; if (m.x < -0.2) m.x = 1.2;
        const g = ctx.createRadialGradient(m.x * W, m.y * H, 0, m.x * W, m.y * H, m.r * W);
        g.addColorStop(0, `rgba(255,255,255,${m.a})`); g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(m.x * W, m.y * H, m.r * W, m.r * W * .45, 0, 0, 6.283); ctx.fill();
      }
      // บอลลูน
      for (const b of this.balloons) {
        const x = (b.x + Math.sin(t * .2 + b.ph) * .02) * W, y = (b.y + Math.sin(t * .35 + b.ph) * .015) * H, s = W * .022;
        ctx.save(); ctx.translate(x, y);
        const g = ctx.createLinearGradient(-s, 0, s, 0);
        g.addColorStop(0, `hsl(${b.hue} 80% 45%)`); g.addColorStop(.5, `hsl(${b.hue + 30} 90% 62%)`); g.addColorStop(1, `hsl(${b.hue} 80% 45%)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 1.2, 0, 0, 6.283); ctx.fill();
        ctx.strokeStyle = "rgba(60,40,20,.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * .5, s * 1.05); ctx.lineTo(-s * .2, s * 1.6); ctx.moveTo(s * .5, s * 1.05); ctx.lineTo(s * .2, s * 1.6); ctx.stroke();
        ctx.fillStyle = "#7a4a22"; ctx.fillRect(-s * .22, s * 1.6, s * .44, s * .35);
        ctx.restore();
      }
      // รถและคนตามเส้นทาง: ไกลออกไป (ด้านบนของภาพ) ตัวเล็กลง และเอียงตามแนวถนน
      const order = this.movers.map(m => {
        const ty = ROUTE_TYPES[m.r.type], spd = m.r.sp || 1;
        m.t += (ty.speed * spd / Math.max(.05, m.len)) * dt; if (m.t >= 2) m.t -= 2;
        const forward = m.t < 1, f = forward ? m.t : 2 - m.t;
        const [px, py, dx, dy] = this.posOn(m, f * m.len);
        const vx = (forward ? dx : -dx) * W, vy = (forward ? dy : -dy) * H;
        return { m, ty, spd, px, py, vx, vy };
      }).sort((a, b) => a.py - b.py); // วาดจากไกลไปใกล้
      for (const o of order) {
        const { m, ty, spd, px, py, vx, vy } = o, walker = m.r.type === "walk" || m.r.type === "hike";
        const persp = .72 + py * .55, size = Math.max(6, W * ty.size * .7 * (m.r.sz || 1) * persp);
        const right = vx >= 0, ang = walker ? 0 : Math.max(-.42, Math.min(.42, Math.atan2(vy, Math.abs(vx) || .001)));
        const bob = walker ? Math.abs(Math.sin(t * 6.5 + m.ph)) * size * .03 : 0;
        ctx.save(); ctx.translate(px * W, py * H);
        // เงาบนพื้น
        ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(0, size * (walker ? .02 : .1), size * (walker ? .22 : .5), size * .07, 0, 0, 6.283); ctx.fill();
        ctx.translate(0, -bob);
        if (!right) ctx.scale(-1, 1);
        ctx.rotate(right ? ang : ang);
        this.sprite(m.r.type, size, m, t, spd);
        ctx.restore();
      }
      // ผีเสื้อ
      for (const b of this.butterflies) {
        const x = (b.hx + Math.sin(t * .4 * b.sp + b.ph) * .06 + Math.sin(t * 1.3 * b.sp) * .01) * W;
        const y = (b.hy + Math.cos(t * .3 * b.sp + b.ph) * .04 + Math.sin(t * 2.1) * .006) * H;
        const s = Math.max(5, W * .008), flap = Math.abs(Math.sin(t * 14 * b.sp + b.ph));
        ctx.save(); ctx.translate(x, y); ctx.fillStyle = b.col; ctx.strokeStyle = "rgba(40,30,20,.6)"; ctx.lineWidth = .7;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(side * s * .55 * flap, -s * .25, s * .6 * flap + .5, s * .55, side * .5, 0, 6.283); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(side * s * .4 * flap, s * .35, s * .4 * flap + .4, s * .35, -side * .4, 0, 6.283); ctx.fill();
        }
        ctx.fillStyle = "#3b2a1a"; ctx.fillRect(-.8, -s * .6, 1.6, s * 1.2);
        ctx.restore();
      }
      // ฝูงนกบินผ่านเป็นระยะ
      if (this.cfg.birds) {
        if (!this.flock && now > this.nextFlock) {
          const ltr = Math.random() < .5, y0 = this.rnd(.06, .3);
          this.flock = { ltr, x: ltr ? -.1 : 1.1, y0, birds: Array.from({ length: Math.floor(this.rnd(4, 8)) }, (_, i) => ({ ox: -i * .028 * (ltr ? 1 : -1) + this.rnd(-.01, .01), oy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .018, ph: this.rnd(0, 6) })) };
        }
        if (this.flock) {
          const f = this.flock; f.x += (f.ltr ? 1 : -1) * .055 * dt;
          ctx.strokeStyle = "rgba(35,35,40,.8)"; ctx.lineWidth = Math.max(1.2, W * .0022); ctx.lineCap = "round";
          for (const b of f.birds) {
            const x = (f.x + b.ox) * W, y = (f.y0 + b.oy + Math.sin(t * 1.5 + b.ph) * .006) * H, s = Math.max(5, W * .011), w = Math.sin(t * 9 + b.ph) * s * .5;
            ctx.beginPath(); ctx.moveTo(x - s, y - w); ctx.quadraticCurveTo(x - s * .4, y - s * .3, x, y); ctx.quadraticCurveTo(x + s * .4, y - s * .3, x + s, y - w); ctx.stroke();
          }
          if (f.x < -.4 || f.x > 1.4) { this.flock = null; this.nextFlock = now + this.rnd(5000, 11000); }
        }
      }
    }
    this.kick();
  }
}
