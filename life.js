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
const DEFAULT_ANIM = { birds: true, butterflies: true, mist: true, balloons: false, routes: [] };

function cleanAnim(a) {
  a = a || {};
  return {
    birds: a.birds !== false, butterflies: a.butterflies !== false, mist: a.mist !== false, balloons: !!a.balloons,
    routes: (Array.isArray(a.routes) ? a.routes : []).slice(0, 20).map(r => ({
      type: ROUTE_TYPES[r.type] ? r.type : "car",
      n: Math.max(1, Math.min(5, Math.round(+r.n || 1))),
      pts: (Array.isArray(r.pts) ? r.pts : []).slice(0, 40).map(p => [Math.max(0, Math.min(100, +(+p[0]).toFixed(1) || 0)), Math.max(0, Math.min(100, +(+p[1]).toFixed(1) || 0))])
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
      const cols = ["#d94b3d", "#2f7fd8", "#f2f2f2", "#f2b134", "#3aa76d", "#7b5cd6", "#222831"];
      for (let k = 0; k < r.n; k++) this.movers.push({ r, pts, seg, len, t: (k / r.n) * 2 + this.rnd(0, .2), dir: 1, col: cols[Math.floor(this.rnd(0, cols.length))], shirt: ["#e85d4a", "#3b82c4", "#f2c14e", "#4caf7a", "#ffffff"][Math.floor(this.rnd(0, 5))] });
    });
  }
  posOn(m, d) { // ตำแหน่งตามระยะทาง d (0..len)
    let i = 0; while (i < m.seg.length - 1 && d > m.seg[i]) { d -= m.seg[i]; i++; }
    const f = m.seg[i] ? Math.min(1, d / m.seg[i]) : 0, a = m.pts[i], b = m.pts[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0]];
  }
  /* วาดรถ คน และเรือเป็นรูปเล็ก ๆ (ไม่ใช้ emoji เพื่อให้เหมือนกันทุกเครื่อง) */
  sprite(type, s, m, t) {
    const c = this.ctx, rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fill(); };
    const wheel = (x, y, r) => { c.fillStyle = "#1d1d1f"; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); c.fillStyle = "#9aa0a6"; c.beginPath(); c.arc(x, y, r * .45, 0, 6.283); c.fill(); };
    const person = (x, y, h, legs) => {
      c.strokeStyle = "#2b2b2b"; c.lineWidth = Math.max(1.4, h * .09); c.lineCap = "round";
      const sw = legs ? Math.sin(t * 7 + m.len * 9) * h * .16 : 0;
      if (legs) { c.beginPath(); c.moveTo(x, y - h * .32); c.lineTo(x + sw, y); c.moveTo(x, y - h * .32); c.lineTo(x - sw, y); c.stroke(); }
      c.fillStyle = m.shirt; rr(x - h * .13, y - h * .7, h * .26, h * .4, h * .08);
      c.fillStyle = "#e9b48a"; c.beginPath(); c.arc(x, y - h * .82, h * .13, 0, 6.283); c.fill();
      c.fillStyle = "#2b2118"; c.beginPath(); c.arc(x, y - h * .86, h * .13, Math.PI, 0); c.fill();
    };
    if (type === "car") {
      c.fillStyle = m.col; rr(-s * .5, -s * .2, s, s * .3, s * .1);
      c.beginPath(); c.moveTo(-s * .28, -s * .2); c.lineTo(-s * .16, -s * .42); c.lineTo(s * .18, -s * .42); c.lineTo(s * .32, -s * .2); c.closePath(); c.fill();
      c.fillStyle = "#bfe3f5"; c.beginPath(); c.moveTo(-s * .2, -s * .22); c.lineTo(-s * .12, -s * .37); c.lineTo(s * .0, -s * .37); c.lineTo(s * .0, -s * .22); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(s * .04, -s * .22); c.lineTo(s * .04, -s * .37); c.lineTo(s * .16, -s * .37); c.lineTo(s * .26, -s * .22); c.closePath(); c.fill();
      c.fillStyle = "#ffe08a"; rr(s * .42, -s * .15, s * .07, s * .07, 2);
      wheel(-s * .3, s * .1, s * .11); wheel(s * .3, s * .1, s * .11);
    } else if (type === "van") {
      c.fillStyle = m.col === "#222831" ? "#f2f2f2" : m.col; rr(-s * .55, -s * .5, s * 1.1, s * .58, s * .1);
      c.fillStyle = "#bfe3f5"; for (let i = 0; i < 4; i++) rr(-s * .46 + i * s * .24, -s * .42, s * .18, s * .18, 2);
      c.fillStyle = "rgba(0,0,0,.15)"; c.fillRect(-s * .55, -s * .12, s * 1.1, s * .05);
      wheel(-s * .32, s * .1, s * .12); wheel(s * .32, s * .1, s * .12);
    } else if (type === "moto" || type === "bike") {
      const r = s * (type === "bike" ? .2 : .17);
      c.strokeStyle = type === "bike" ? "#333" : "#1d1d1f"; c.lineWidth = Math.max(1.2, s * .05);
      c.beginPath(); c.arc(-s * .3, s * .02, r, 0, 6.283); c.stroke();
      c.beginPath(); c.arc(s * .3, s * .02, r, 0, 6.283); c.stroke();
      if (type === "moto") { c.fillStyle = m.col; rr(-s * .32, -s * .22, s * .6, s * .16, s * .06); }
      else { c.beginPath(); c.moveTo(-s * .3, s * .02); c.lineTo(-s * .02, -s * .18); c.lineTo(s * .3, s * .02); c.lineTo(s * .02, s * .02); c.closePath(); c.stroke(); }
      person(-s * .02, -s * .12, s * .62, false);
    } else if (type === "boat") {
      c.fillStyle = "#7a4a22"; c.beginPath(); c.moveTo(-s * .6, -s * .1); c.lineTo(s * .6, -s * .1); c.lineTo(s * .42, s * .12); c.lineTo(-s * .45, s * .12); c.closePath(); c.fill();
      c.fillStyle = "#f4efe6"; rr(-s * .25, -s * .34, s * .45, s * .24, 2);
      c.fillStyle = "#2f7fd8"; rr(-s * .3, -s * .4, s * .55, s * .07, 2);
      c.strokeStyle = "rgba(255,255,255,.7)"; c.lineWidth = 1; c.beginPath(); c.moveTo(-s * .75, s * .16); c.lineTo(-s * .5, s * .14); c.stroke();
    } else {
      person(0, s * .4, s, true);
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
      // รถและคนตามเส้นทาง
      for (const m of this.movers) {
        const ty = ROUTE_TYPES[m.r.type];
        m.t += (ty.speed / Math.max(.05, m.len)) * dt; if (m.t >= 2) m.t -= 2;
        const forward = m.t < 1, f = forward ? m.t : 2 - m.t;
        const [px, py, dx] = this.posOn(m, f * m.len);
        const goingRight = forward ? dx > 0 : dx < 0;
        const size = Math.max(14, W * ty.size), bob = m.r.type === "walk" || m.r.type === "hike" ? Math.abs(Math.sin(t * 8 + m.len * 9)) * size * .08 : 0;
        ctx.save(); ctx.translate(px * W, py * H - bob);
        ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(0, size * (m.r.type === "walk" || m.r.type === "hike" ? .42 : .2) + bob, size * .4, size * .08, 0, 0, 6.283); ctx.fill();
        if (!goingRight) ctx.scale(-1, 1); // รูปวาดหันขวา กลับด้านเมื่อวิ่งไปทางซ้าย
        this.sprite(m.r.type, size, m, t);
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
