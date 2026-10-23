/* ใช้ร่วมกันทั้งหน้าผู้ชมและหน้าแอดมิน */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const narrow = () => matchMedia("(max-width:640px)").matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- ภาพแผนที่ (รองรับลิงก์ Google Drive) ---------- */
function setMapImage(img, url) {
  img.onerror = null;
  if (!url) { img.removeAttribute("src"); return; }
  const m = /lh3\.googleusercontent\.com\/d\/([\w-]+)/.exec(url);
  if (m) img.onerror = () => { img.onerror = null; img.src = "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w2000"; };
  img.src = url;
}

/* ---------- เสียงอ่าน ---------- */
const Voice = {
  synth: window.speechSynthesis || null,
  voices: [], voice: null, rate: store.get("tts_rate", 0.95), pitch: store.get("tts_pitch", 1), on: store.get("tts_on", true),
  queueId: 0, onstate: null,
  score(v) {
    let s = 0;
    if (/natural|neural|online/i.test(v.name)) s += 4;   // เสียงธรรมชาติของ Microsoft Edge
    if (/google/i.test(v.name)) s += 3;
    if (/premwadee|niwat|kanya|narisa/i.test(v.name)) s += 1;
    if (!v.localService) s += 1;
    return s;
  },
  // บอกเพศของเสียงจากชื่อเสียงที่รู้จัก
  gender(v) {
    if (/niwat|\bmale\b|ชาย|\bman\b/i.test(v.name)) return "ชาย";
    if (/premwadee|pattara|kanya|narisa|achara|female|หญิง|woman/i.test(v.name)) return "หญิง";
    return "";
  },
  load() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices().filter(v => /^th/i.test(v.lang) || /thai/i.test(v.name)).sort((a, b) => this.score(b) - this.score(a));
    const saved = store.get("tts_voice", "");
    this.voice = this.voices.find(v => v.name === saved) || this.voices[0] || null;
    if (this.onvoices) this.onvoices();
  },
  // ตัดข้อความเป็นช่วงสั้น ๆ ทำให้เสียงไม่สะดุดและไม่ขาดกลางคันใน Chrome
  chunks(text) {
    const parts = String(text).replace(/\s+/g, " ").split(/(?<=[.!?。…ฯ\n])\s+|\s+/).filter(Boolean);
    const out = []; let cur = "";
    for (const p of parts) {
      if ((cur + " " + p).trim().length > 90 && cur) { out.push(cur); cur = p; }
      else cur = (cur ? cur + " " : "") + p;
    }
    if (cur) out.push(cur);
    return out;
  },
  speak(parts) {
    if (!this.synth || !this.on) return Promise.resolve();
    this.stop();
    const id = ++this.queueId;
    const list = [].concat(parts).flatMap(t => this.chunks(t));
    if (this.onstate) this.onstate(true);
    return new Promise(resolve => {
      let i = 0, keep;
      const next = () => {
        if (id !== this.queueId || i >= list.length) { clearInterval(keep); if (id === this.queueId && this.onstate) this.onstate(false); resolve(); return; }
        const u = new SpeechSynthesisUtterance(list[i++]);
        u.lang = "th-TH"; if (this.voice) u.voice = this.voice; u.rate = this.rate; u.pitch = this.pitch;
        u.onend = () => setTimeout(next, 60);
        u.onerror = () => setTimeout(next, 60);
        try { this.synth.speak(u); } catch (e) { next(); }
      };
      // ป้องกันเสียงค้างใน Chrome บนคอมพิวเตอร์
      keep = setInterval(() => { try { if (this.synth.paused) this.synth.resume(); } catch (e) {} }, 3000);
      next();
    });
  },
  stop() { this.queueId++; try { this.synth && this.synth.cancel(); } catch (e) {} if (this.onstate) this.onstate(false); }
};
if (Voice.synth) { Voice.load(); try { Voice.synth.addEventListener("voiceschanged", () => Voice.load()); } catch (e) { Voice.synth.onvoiceschanged = () => Voice.load(); } }

/* โทนเสียง: ใช้ได้ทุกเครื่อง แม้เครื่องจะมีเสียงภาษาไทยเพียงเสียงเดียว */
const TONES = [
  { v: 1, t: "ปกติ" },
  { v: 0.6, t: "ทุ้มต่ำ (แบบผู้ชาย)" },
  { v: 0.8, t: "ทุ้มนุ่ม" },
  { v: 1.25, t: "สูงใส (แบบผู้หญิง)" },
  { v: 1.5, t: "สดใส (แบบเด็ก)" }
];
/* กล่องตั้งค่าเสียง (เลือกผู้อ่าน + โทนเสียง + ความเร็ว) */
function mountVoiceBox(box, noteEl) {
  box.innerHTML = `
    <label for="vSel">ผู้อ่าน <small>(เสียงที่มีในเครื่องนี้)</small><select id="vSel"></select></label>
    <label for="vTone">โทนเสียง<select id="vTone">${TONES.map(o => `<option value="${o.v}">${o.t}</option>`).join("")}</select></label>
    <label for="vRate">ความเร็ว <small id="vRateVal"></small><input id="vRate" type="range" min="0.6" max="1.4" step="0.05"></label>
    <button type="button" id="vTest">🔊 ทดลองฟัง</button>`;
  const sel = box.querySelector("#vSel"), rate = box.querySelector("#vRate"), rv = box.querySelector("#vRateVal"), tone = box.querySelector("#vTone");
  const label = v => {
    const g = Voice.gender(v);
    return esc(v.name.replace(/Microsoft |Google /, "").replace(/ Online \(Natural\)/, "").replace(/ - Thai.*$/, "").replace(/\s*\(.*?\)\s*$/, "") || v.name)
      + (g ? " · เสียง" + g : "") + (Voice.score(v) >= 4 ? " ★ ชัดที่สุด" : "");
  };
  const fill = () => {
    const groups = [["หญิง", "เสียงผู้หญิง"], ["ชาย", "เสียงผู้ชาย"], ["", "เสียงอื่น ๆ"]];
    sel.innerHTML = Voice.voices.length
      ? groups.map(([g, title]) => { const list = Voice.voices.filter(v => Voice.gender(v) === g); return list.length ? `<optgroup label="${title}">${list.map(v => `<option value="${esc(v.name)}">${label(v)}</option>`).join("")}</optgroup>` : ""; }).join("")
      : `<option>ไม่พบเสียงภาษาไทยในเครื่องนี้</option>`;
    if (Voice.voice) sel.value = Voice.voice.name;
    let n = "";
    if (!Voice.synth) n = "เบราว์เซอร์นี้ไม่รองรับเสียงอ่าน";
    else if (!Voice.voices.length) n = "เครื่องนี้ยังไม่มีเสียงภาษาไทย บนคอมพิวเตอร์แนะนำให้เปิดด้วย Microsoft Edge ซึ่งมีเสียงไทยแบบธรรมชาติ";
    else if (Voice.score(Voice.voices[0]) < 4 && !/android|iphone|ipad/i.test(navigator.userAgent)) n = "เสียงในเบราว์เซอร์นี้อาจสะดุด แนะนำเปิดด้วย Microsoft Edge แล้วเลือกเสียงที่มี ★ จะชัดและลื่นกว่า";
    if (noteEl) noteEl.textContent = n;
  };
  Voice.onvoices = fill; fill();
  rate.value = Voice.rate; rv.textContent = "x" + Number(Voice.rate).toFixed(2);
  tone.value = String(TONES.find(o => o.v === Voice.pitch) ? Voice.pitch : 1);
  tone.onchange = () => { Voice.pitch = +tone.value; store.set("tts_pitch", Voice.pitch); };
  sel.onchange = () => { Voice.voice = Voice.voices.find(v => v.name === sel.value) || Voice.voice; store.set("tts_voice", sel.value); };
  rate.oninput = () => { Voice.rate = +rate.value; rv.textContent = "x" + Voice.rate.toFixed(2); store.set("tts_rate", Voice.rate); };
  box.querySelector("#vTest").onclick = () => { const was = Voice.on; Voice.on = true; Voice.speak("สวัสดี ยินดีต้อนรับสู่แผนที่แหล่งเรียนรู้ อำเภอเทิง"); Voice.on = was; };
}

/* ---------- วาดหมุดและกล่องข้อความ ---------- */
function renderPins(stage, places, active) {
  stage.querySelectorAll(".pin").forEach(n => n.remove());
  places.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "pin" + (i === active ? " active" : "");
    b.style.left = p.x + "%"; b.style.top = p.y + "%";
    b.textContent = i + 1; b.dataset.i = i;
    b.setAttribute("aria-label", (i + 1) + ". " + (p.title || "สถานที่"));
    stage.appendChild(b);
  });
}
function placeCard(stage, slot, p, i, opts) {
  document.querySelectorAll(".card").forEach(c => c.remove());
  stage.querySelectorAll(".pin").forEach(n => n.classList.toggle("active", +n.dataset.i === i));
  if (!p) return null;
  const c = document.createElement("div");
  c.className = "card"; c.setAttribute("role", "dialog"); c.setAttribute("aria-label", p.title || "");
  c.innerHTML = `<button type="button" class="x" aria-label="ปิด">✕</button>
    <h2>${i + 1}. ${esc(p.title)}</h2><p>${esc(p.text)}</p>
    <div class="row">${opts && opts.noSpeak ? "" : `<button type="button" class="say">🔊 ฟัง</button>`}${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">📍 ดูแผนที่ / ข้อมูลเพิ่ม</a>` : ""}</div>`;
  c.querySelector(".x").onclick = () => { Voice.stop(); placeCard(stage, slot, null, -1); if (opts && opts.onclose) opts.onclose(); };
  const say = c.querySelector(".say"); if (say) say.onclick = () => Voice.speak([p.title, p.text]);
  // แสดงข้อมูลใต้ภาพเสมอ ไม่บังแผนที่
  slot.appendChild(c);
  if (opts && opts.scroll) c.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return c;
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600);
}
