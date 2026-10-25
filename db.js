/* เชื่อมต่อ Firebase (Firestore + Authentication) ใช้ร่วมกันทั้งหน้าผู้ชมและหน้าแอดมิน */
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  onSnapshot, query, orderBy, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, setPersistence, browserSessionPersistence,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

export const configured = typeof FIREBASE_CONFIG === "object" && !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.projectId;
const EMU = window.__FB_EMULATOR__; // ใช้เฉพาะตอนทดสอบระบบ

let app, db, auth;
if (configured) {
  app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  auth = getAuth(app);
  if (EMU) { connectFirestoreEmulator(db, EMU.host, EMU.fs); connectAuthEmulator(auth, `http://${EMU.host}:${EMU.auth}`, { disableWarnings: true }); }
}
export { auth };

const MAX_IMAGE_CHARS = 950000; // เอกสาร Firestore 1 รายการเก็บได้ไม่เกิน 1 MB

/* ---------- ตัวช่วย ---------- */
export function normName(s) {
  // ใช้เฉพาะชื่อ: ตัดคำนำหน้า และตัดนามสกุลทิ้งถ้าพิมพ์มาด้วย
  const t = String(s || "").trim().replace(/^(นางสาว|นาง|นาย|น\.ส\.|ครู)\s*/, "");
  return (t.split(/\s+/)[0] || "").trim();
}
export function phonePass(s) {
  let d = String(s == null ? "" : s).replace(/\D/g, "");
  if (d.startsWith("66")) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d; // เบอร์จาก Excel ที่เลข 0 ด้านหน้าหายไป
  return d;
}
const newEmail = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "@teacher.mapthoeng.app";
function thaiAuthError(e) {
  const c = (e && e.code) || "";
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return "ชื่อหรือรหัสผ่านไม่ถูกต้อง";
  if (/too-many-requests/.test(c)) return "ลองเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่";
  if (/network/.test(c)) return "เชื่อมต่ออินเทอร์เน็ตไม่ได้";
  if (/permission-denied/.test(c)) return "ไม่มีสิทธิ์ทำรายการนี้";
  if (/weak-password/.test(c)) return "รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 6 ตัวอักษร";
  if (/requires-recent-login/.test(c)) return "กรุณาออกจากระบบแล้วเข้าใหม่ก่อนเปลี่ยนรหัสผ่าน";
  if (/operation-not-allowed/.test(c)) return "ยังไม่ได้เปิดการเข้าสู่ระบบแบบ Email/Password ใน Firebase";
  return (e && e.message) || "เกิดข้อผิดพลาด";
}
function fail(msg, extra) { const e = new Error(msg); Object.assign(e, extra || {}); return e; }

/* ---------- แผนที่ (อ่านได้ทุกคน อัปเดตแบบเรียลไทม์) ---------- */
export function watchMaps(cb) {
  return onSnapshot(query(collection(db, "maps"), orderBy("order")),
    snap => cb(snap.docs.map(d => Object.assign({ id: d.id, places: [] }, d.data()))),
    err => cb(null, thaiAuthError(err)));
}
const imgCache = {};
export async function imageSrc(m) {
  if (!m || !m.image) return "";
  if (m.image !== "firestore") return m.image;
  const key = m.id + ":" + (m.imageRev || 0);
  if (!imgCache[key]) imgCache[key] = getDoc(doc(db, "mapImages", m.id)).then(s => (s.exists() ? s.data().data : ""));
  return imgCache[key];
}

/* ---------- เข้าสู่ระบบ ---------- */
const RULES_MSG = "Firebase ไม่อนุญาตให้อ่านข้อมูล: กรุณาวางกฎจากไฟล์ firestore.rules ที่ Firestore Database > Rules แล้วกด Publish จากนั้นรีเฟรชหน้านี้";
export async function isSetupDone() {
  try { return (await getDoc(doc(db, "meta", "setup"))).exists(); }
  catch (e) { throw fail(/permission/i.test(e.code || e.message) ? RULES_MSG : thaiAuthError(e)); }
}
export function onUser(cb) { return onAuthStateChanged(auth, cb); }
export async function login(name, password) {
  const key = normName(name), raw = String(password || "").trim(), asPhone = phonePass(raw);
  if (!key || !raw) throw fail("กรุณากรอกชื่อและรหัสผ่าน");
  let l;
  try { l = await getDoc(doc(db, "logins", key)); }
  catch (e) { throw fail(/permission/i.test(e.code || e.message) ? RULES_MSG : thaiAuthError(e)); }
  if (!l.exists()) throw fail("ชื่อหรือรหัสผ่านไม่ถูกต้อง");
  await setPersistence(auth, browserSessionPersistence);
  // ลองรหัสผ่านตามที่พิมพ์ก่อน (รหัสที่ครูตั้งเอง) ถ้าไม่ได้ ลองแบบเบอร์โทร (เช่น พิมพ์ 087-xxx หรือ +66)
  const email = l.data().email;
  try { await signInWithEmailAndPassword(auth, email, raw); }
  catch (e) {
    if (!/invalid-credential|wrong-password|invalid-login/.test(e.code || "") || !asPhone || asPhone === raw) throw fail(thaiAuthError(e));
    try { await signInWithEmailAndPassword(auth, email, asPhone); } catch (e2) { throw fail(thaiAuthError(e2)); }
  }
  return await profile();
}
export async function profile() {
  const u = auth.currentUser; if (!u) return null;
  const t = await getDoc(doc(db, "teachers", u.uid));
  if (!t.exists()) { await signOut(auth); throw fail("บัญชีนี้ถูกลบแล้ว"); }
  return Object.assign({ uid: u.uid }, t.data());
}
export function watchProfile(uid, cb) {
  return onSnapshot(doc(db, "teachers", uid), s => cb(s.exists() ? Object.assign({ uid }, s.data()) : null), () => cb(null));
}
export function logout() { return signOut(auth); }

/* ตั้งค่าครั้งแรก: สร้างแอดมินหลักคนแรก และตำบลตัวอย่าง */
export async function firstSetup(t, seedMap) {
  const key = normName(t.name), pass = phonePass(t.phone);
  if (!key || pass.length < 9) throw fail("กรุณากรอกชื่อและเบอร์โทรให้ครบ");
  if (await isSetupDone()) throw fail("ระบบถูกตั้งค่าไปแล้ว กรุณาเข้าสู่ระบบ");
  await setPersistence(auth, browserSessionPersistence);
  const email = newEmail();
  let cred;
  try { cred = await createUserWithEmailAndPassword(auth, email, pass); } catch (e) { throw fail(thaiAuthError(e)); }
  const uid = cred.user.uid, b = writeBatch(db);
  b.set(doc(db, "teachers", uid), { name: key, last: String(t.last || "").trim(), phone: pass, role: "main" });
  b.set(doc(db, "logins", key), { email, uid });
  b.set(doc(db, "meta", "setup"), { done: true, at: Date.now() });
  await b.commit();
  if (seedMap) await setDoc(doc(db, "maps", seedMap.id), Object.assign({}, seedMap.data, { updatedAt: Date.now(), updatedBy: key }));
  return await profile();
}

/* ---------- แก้ไขแผนที่ (ครูทุกคน) ---------- */
export async function saveMap(m, baseUpdatedAt, by) {
  const ref = doc(db, "maps", m.id);
  const places = (m.places || []).slice(0, 40).map(p => ({
    x: Math.max(0, Math.min(100, +p.x || 0)), y: Math.max(0, Math.min(100, +p.y || 0)),
    title: String(p.title || "").slice(0, 120), text: String(p.text || "").slice(0, 2000),
    link: /^https?:\/\//i.test(p.link || "") ? String(p.link).slice(0, 500) : "",
    video: /^https?:\/\//i.test(p.video || "") ? String(p.video).slice(0, 500) : ""
  }));
  if (m.newImage && m.newImage.length > MAX_IMAGE_CHARS) throw fail("ภาพใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง");
  try {
    return await runTransaction(db, async tx => {
      const cur = await tx.get(ref);
      if (!cur.exists()) throw fail("ไม่พบตำบลนี้ อาจถูกลบไปแล้ว");
      const c = cur.data();
      if (baseUpdatedAt && c.updatedAt && c.updatedAt !== baseUpdatedAt)
        throw fail("ครู" + (c.updatedBy || "ท่านอื่น") + " เพิ่งบันทึกตำบลนี้ก่อนหน้า กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไข", { conflict: true });
      const now = Date.now();
      const data = { name: String(m.name || "").slice(0, 80), title: String(m.title || "").slice(0, 150), places, updatedAt: now, updatedBy: by,
        video: /^https?:\/\//i.test(m.video || "") ? String(m.video).slice(0, 500) : "",
        anim: typeof cleanAnim === "function" ? cleanAnim(m.anim) : (m.anim || null) };
      if (m.newImage) { tx.set(doc(db, "mapImages", m.id), { data: m.newImage }); data.image = "firestore"; data.imageRev = now; data.thumb = m.newThumb || ""; }
      else data.image = String(m.image || "").slice(0, 500);
      tx.update(ref, data);
      return now;
    });
  } catch (e) { if (e.conflict || !e.code) throw e; throw fail(thaiAuthError(e)); }
}
export function newMapId() { return doc(collection(db, "maps")).id; }
export async function createMap(id, name, by, order) {
  const ref = doc(db, "maps", id);
  await setDoc(ref, { name: name.slice(0, 80), title: ("แผนที่แหล่งเรียนรู้ " + name + " อำเภอเทิง").slice(0, 150), image: "", places: [], order, updatedAt: Date.now(), updatedBy: by });
  return id;
}
export async function deleteMap(id) {
  const b = writeBatch(db);
  b.delete(doc(db, "maps", id)); b.delete(doc(db, "mapImages", id));
  await b.commit();
}

/* ย่อภาพให้พอดีกับขนาดที่ Firestore รับได้ */
export async function compressImage(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(fail("เปิดไฟล์ภาพไม่ได้")); i.src = URL.createObjectURL(file); });
  for (const dim of [1600, 1400, 1200, 1000]) {
    const s = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.72, 0.62]) { const d = c.toDataURL("image/jpeg", q); if (d.length <= MAX_IMAGE_CHARS) return d; }
  }
  throw fail("ภาพใหญ่เกินไป กรุณาใช้ภาพที่เล็กลง");
}

/* ภาพย่อสำหรับการ์ดหน้าแรก */
export async function makeThumb(dataUrl) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const s = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.78);
}

/* ---------- จัดการครู (แอดมินหลัก) ---------- */
export async function listTeachers() {
  const s = await getDocs(collection(db, "teachers"));
  return s.docs.map(d => Object.assign({ uid: d.id }, d.data())).sort((a, b) => (a.role === "main" ? -1 : 0) - (b.role === "main" ? -1 : 0) || a.name.localeCompare(b.name, "th"));
}
// ใช้แอปสำรองสร้างบัญชี เพื่อไม่ให้แอดมินหลักถูกออกจากระบบ
async function createAccount(pass) {
  const sec = initializeApp(FIREBASE_CONFIG, "sec" + Date.now() + Math.random());
  const a2 = getAuth(sec);
  if (EMU) connectAuthEmulator(a2, `http://${EMU.host}:${EMU.auth}`, { disableWarnings: true });
  const email = newEmail();
  try { const uid = (await createUserWithEmailAndPassword(a2, email, pass)).user.uid; await signOut(a2); return { uid, email }; }
  catch (e) { throw fail(thaiAuthError(e)); }
  finally { deleteApp(sec).catch(() => {}); }
}
export async function addTeacher(t) {
  const key = normName(t.name), pass = phonePass(t.phone);
  if (!key) throw fail("กรุณาใส่ชื่อ");
  if (pass.length < 9) throw fail("เบอร์โทรของ " + key + " ไม่ถูกต้อง");
  if ((await getDoc(doc(db, "logins", key))).exists()) throw fail("มีชื่อ " + key + " อยู่แล้ว", { exists: true });
  const { uid, email } = await createAccount(pass);
  const b = writeBatch(db);
  b.set(doc(db, "teachers", uid), { name: key, last: String(t.last || "").trim(), phone: pass, role: t.role === "main" ? "main" : "teacher", maps: Array.isArray(t.maps) ? t.maps.slice(0, 50) : [] });
  b.set(doc(db, "logins", key), { email, uid });
  await b.commit();
}
export async function deleteTeacher(t) {
  const b = writeBatch(db);
  b.delete(doc(db, "teachers", t.uid)); b.delete(doc(db, "logins", t.name));
  await b.commit();
}
/* ครูเปลี่ยนรหัสผ่านของตัวเอง (ต้องยืนยันรหัสผ่านปัจจุบัน) */
export async function changePassword(current, next) {
  const u = auth.currentUser; if (!u) throw fail("กรุณาเข้าสู่ระบบใหม่");
  next = String(next || "");
  if (next.length < 6) throw fail("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
  const cur = String(current || "").trim(), alt = phonePass(cur);
  const tryAuth = p => reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, p));
  try { await tryAuth(cur); }
  catch (e) {
    if (!alt || alt === cur) throw fail("รหัสผ่านปัจจุบันไม่ถูกต้อง");
    try { await tryAuth(alt); } catch (e2) { throw fail("รหัสผ่านปัจจุบันไม่ถูกต้อง"); }
  }
  try { await updatePassword(u, next); } catch (e) { throw fail(thaiAuthError(e)); }
  await updateDoc(doc(db, "teachers", u.uid), { pwChanged: true });
}
/* แอดมินหลักรีเซ็ตรหัสผ่านครูกลับเป็นเบอร์โทร
   (Firebase แบบฟรีเปลี่ยนรหัสคนอื่นตรง ๆ ไม่ได้ จึงสร้างบัญชีใหม่ที่ใช้เบอร์โทร แล้วย้ายข้อมูลครูไปบัญชีใหม่ บัญชีเก่าใช้ไม่ได้ทันที) */
export async function resetTeacherPassword(t) {
  const pass = phonePass(t.phone);
  if (pass.length < 9) throw fail("ไม่มีเบอร์โทรของครู" + t.name + " ในระบบ");
  const { uid, email } = await createAccount(pass);
  const data = { name: t.name, last: t.last || "", phone: pass, role: t.role === "main" ? "main" : "teacher", maps: t.maps || [], pwChanged: false };
  const b = writeBatch(db);
  b.set(doc(db, "teachers", uid), data);
  b.delete(doc(db, "teachers", t.uid));
  b.set(doc(db, "logins", t.name), { email, uid });
  await b.commit();
}
export async function setTeacherMaps(t, ids) { await updateDoc(doc(db, "teachers", t.uid), { maps: ids.slice(0, 50) }); }
export async function setRole(t, role) { await updateDoc(doc(db, "teachers", t.uid), { role: role === "main" ? "main" : "teacher" }); }
