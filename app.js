/* 蕾蕾的地盘 —— 主逻辑 */
"use strict";
const DB_KEY = "leilei_db_v1";
const BOOK_KEY = "leilei_book_v1";

/* ---------------- 数据 ---------------- */
function defaultDB(){
  return {
    firstUse: todayKey(),
    points: 0,
    treats: 0,
    cat: { alive: true, growth: 0, diedAt: null },
    owned: {},                    // itemId -> 品质序号(0/1/2)
    history: {},                  // 'YYYY-MM-DD' -> {count, tasks:{}, reward:false}
    zentangleDates: [],           // 完成禅绕画的日期
    settings: {
      durations: { reading: 30, yoga: 15, piano: 15 },
      englishLevel: "cz",
      pianoPiece: "送别",
      pianoUrl: "",
      yogaUrl: "",
      readerFont: 18
    },
    day: null
  };
}
let db = load();
function load(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(raw){ const d = JSON.parse(raw); return Object.assign(defaultDB(), d); }
  }catch(e){}
  return defaultDB();
}
function save(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){} }

function pad(n){ return String(n).padStart(2,"0"); }
function fmtDate(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function todayKey(){ return fmtDate(new Date()); }
function keyOffset(off){ const d=new Date(); d.setDate(d.getDate()+off); return fmtDate(d); }
function ensureDay(){
  if(!db.day || db.day.date !== todayKey()){
    db.day = { date: todayKey(), tasks: {
      reading:    { done:false, elapsed:0, running:false },
      english:    { done:false, idx:0 },
      yoga:       { done:false, elapsed:0, running:false },
      piano:      { done:false, elapsed:0, running:false },
      zentangle:  { done:false, photos:[] }
    }};
    save();
  }
}

/* ---------------- 生命周期：饿死 / 复活 ---------------- */
function checkLife(){
  if(!db.firstUse) db.firstUse = todayKey();
  if(db.cat.alive){
    let miss = 0;
    for(let i=1;i<=30;i++){
      const k = keyOffset(-i);
      if(k < db.firstUse) break;              // 开始使用之前的日子不计
      const h = db.history[k];
      if(h && h.count >= 3) break;
      miss++;
    }
    if(miss >= 3){
      db.cat.alive = false; db.cat.diedAt = todayKey(); save();
      toast("😿 连续三天没完成任务，团子饿晕过去了…", true);
      renderCat();
    }
  } else {
    const h1 = db.history[keyOffset(-1)], h2 = db.history[keyOffset(-2)];
    if(h1 && h1.count>=3 && h2 && h2.count>=3){
      db.cat.alive = true; db.cat.growth = 0; save();
      toast("🎉 团子复活啦！变回了刚出生的小奶猫，重新养起～");
      renderCat();
    }
  }
}

/* ---------------- 成长阶段 ---------------- */
const STAGES = [
  { name:"新生小奶猫", min:0 },
  { name:"幼年猫",     min:3 },
  { name:"少年猫",     min:8 },
  { name:"成年猫",     min:15 },
  { name:"圆滚滚成猫", min:26 }
];
function stageIdx(){ let s=0; for(let i=0;i<STAGES.length;i++){ if(db.cat.growth>=STAGES[i].min) s=i; } return s; }

/* ---------------- 任务完成与奖励 ---------------- */
function histEntry(){
  const k = todayKey();
  if(!db.history[k]) db.history[k] = { count:0, tasks:{}, reward:false };
  return db.history[k];
}
function completeTask(id){
  const t = db.day.tasks[id];
  if(!t || t.done) return;
  t.done = true;
  const h = histEntry();
  if(!h.tasks[id]){
    h.tasks[id] = true; h.count++;
    db.points += 5;
    let msg = "任务完成 +5积分 ✓";
    if(h.count === 3){
      h.reward = true; db.treats += 1; db.points += 10;
      msg = "完成三项任务！获得 1 根猫条 + 10积分 🎉 快去喂团子～";
    }
    if(id === "zentangle" && db.zentangleDates[db.zentangleDates.length-1] !== todayKey()){
      db.zentangleDates.push(todayKey());
    }
    save(); toast(msg);
  } else save();
  renderAll();
}

/* ---------------- 计时引擎 ---------------- */
setInterval(()=>{
  ensureDay(); rolloverCheck();
  const dur = db.settings.durations;
  ["reading","yoga","piano"].forEach(id=>{
    const t = db.day.tasks[id];
    if(t.running && !document.hidden){
      t.elapsed++;
      const target = dur[id]*60;
      if(!t.done && t.elapsed >= target) completeTask(id);
      updateTimerUI(id);
      if(t.elapsed % 5 === 0) save();
    }
  });
},1000);
function rolloverCheck(){ if(db.day.date !== todayKey()){ ensureDay(); checkLife(); renderAll(); } }

/* ---------------- 渲染总控 ---------------- */
let currentTask = "reading";
const TASK_META = {
  reading:   { name:"读书", icon:"📖" },
  english:   { name:"英语", icon:"🔤" },
  yoga:      { name:"瑜伽", icon:"🧘" },
  piano:     { name:"钢琴", icon:"🎹" },
  zentangle: { name:"禅绕", icon:"🎨" }
};
function renderAll(){
  renderSidebar(); renderCat();
  renderHead(); renderPanel();
}

function renderSidebar(){
  document.querySelectorAll(".task-btn").forEach(btn=>{
    const id = btn.dataset.task;
    btn.classList.toggle("active", id===currentTask);
    btn.classList.toggle("done", !!db.day.tasks[id].done);
  });
  document.getElementById("sidePoints").textContent = db.points;
  document.getElementById("sideTreats").textContent = db.treats;
  const h = histEntry();
  document.getElementById("sideCount").textContent = h.count + "/5";
}

function renderHead(){
  const m = TASK_META[currentTask];
  document.getElementById("taskTitle").textContent = m.icon + " " + m.name;
  const st = document.getElementById("taskStatus");
  const done = db.day.tasks[currentTask].done;
  st.textContent = done ? "已完成 ✓" : "未完成";
  st.className = "status-chip" + (done ? " done" : "");
  const ds = document.getElementById("durationSet");
  if(["reading","yoga","piano"].includes(currentTask)){
    ds.style.display = "flex";
    document.getElementById("durationInput").value = db.settings.durations[currentTask];
  } else ds.style.display = "none";
}

/* ---------------- 计时条 UI ---------------- */
function updateTimerUI(id){
  const bar = document.getElementById("tmBar-"+id), num = document.getElementById("tmNum-"+id);
  if(!bar || !num) return;
  const t = db.day.tasks[id];
  const target = db.settings.durations[id]*60;
  num.textContent = fmtSec(t.elapsed) + " / " + db.settings.durations[id] + " 分钟";
  bar.style.width = Math.min(100, t.elapsed/target*100) + "%";
}
function fmtSec(s){ return pad(Math.floor(s/60)) + ":" + pad(s%60); }

function timerBoxHTML(id, hint){
  const t = db.day.tasks[id];
  const p = Math.min(100, t.elapsed/(db.settings.durations[id]*60)*100);
  return `<div class="timer-box">
    <div>
      <div class="timer-big" id="tmBig-${id}">${fmtSec(t.elapsed)}</div>
      <div class="timer-total" id="tmNum-${id}">${fmtSec(t.elapsed)} / ${db.settings.durations[id]} 分钟</div>
    </div>
    <div class="timer-progress"><i id="tmBar-${id}" style="width:${p}%"></i></div>
    <div>${hint}</div>
  </div>`;
}
// 让 timer-big 也每秒刷新
const _updateTimerUI = updateTimerUI;
updateTimerUI = function(id){
  _updateTimerUI(id);
  const big = document.getElementById("tmBig-"+id);
  if(big) big.textContent = fmtSec(db.day.tasks[id].elapsed);
};

function doneBannerHTML(txt){
  return `<div class="done-banner">✅ ${txt||"今日任务已完成，干得漂亮！"}</div>`;
}

/* ================= 各任务面板 ================= */
function renderPanel(){
  stopPoseAnim(); stopMetro();
  const p = document.getElementById("panel");
  const t = db.day.tasks[currentTask];
  const fn = { reading:panelReading, english:panelEnglish, yoga:panelYoga, piano:panelPiano, zentangle:panelZentangle }[currentTask];
  p.innerHTML = fn();
  bindPanel(currentTask);
}

/* ---------- 读书 ---------- */
let bookData = null;
try{
  const stored = JSON.parse(localStorage.getItem(BOOK_KEY)||"null");
  if(stored && stored.name){
    if((stored.type === "text" || stored.type === "html") && stored.text){
      bookData = stored;
    } else {
      // PDF / EPUB: 数据未持久化，仅记住书名，需重新上传
      bookData = {name:stored.name, type:stored.type||"text", text:"", needReupload:true};
    }
  }
}catch(e){}

function panelReading(){
  const t = db.day.tasks.english ? db.day.tasks.reading : null;
  const bk = bookData && bookData.name ? bookData : null;
  let html = timerBoxHTML("reading", `<b id="rdMode"></b>`);
  html += `
  <div class="mode-tabs">
    <button class="mode-tab active" onclick="App.rdMode('ebook',this)">📱 电子书</button>
    <button class="mode-tab" onclick="App.rdMode('paper',this)">📕 纸质书（手动计时）</button>
  </div>
  <div id="rdEbook">
    <div class="mode-card">
      <div class="sec-title">上传电子书（支持 TXT / MD / PDF / Word / EPUB）</div>
      <div class="url-row">
        <input type="file" id="bookFile" accept=".txt,.md,.log,.html,.htm,.pdf,.doc,.docx,.epub,text/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip" style="display:none">
        <button class="btn btn-primary" onclick="document.getElementById('bookFile').click()">选择文件</button>
        <button class="btn btn-ghost" id="btnOpenBook" ${bk?"":"disabled"}>📖 打开阅读（自动计时）</button>
      </div>
      <div class="book-meta" id="bookMeta">${bk ? (bk.needReupload ? "当前书架：《"+bk.name+"》（需重新上传）" : "当前书架：《"+bk.name+"》") : "还没有上传电子书"}</div>
      <p class="hint" style="margin-top:8px">· PDF / EPUB / Word 文档均可在浏览器中直接阅读<br>· PDF 和 EPUB 文件较大，仅本次会话有效，刷新需重新上传<br>· Word 文档(.docx)会自动转为网页格式显示</p>
    </div>
    <p class="hint">· 打开电子书后自动开始计时，合上书自动暂停；后台切走时暂停计时。<br>· 看纸质书请切到「纸质书」标签手动计时。<br>· 累计时长达到目标，任务自动打勾 ✓</p>
  </div>
  <div id="rdPaper" style="display:none">
    <div class="mode-card">
      <div class="sec-title">纸质书手动计时</div>
      <div class="url-row">
        <button class="btn btn-primary" id="btnPaperToggle">▶ 开始计时</button>
      </div>
      <p class="hint">按下开始后即使离开页面也持续计时（手动模式）。阅读结束记得暂停。</p>
    </div>
  </div>`;
  if(t.done) html = doneBannerHTML("今日阅读已完成，继续保持！") + html;
  return html;
}
function bindReading(){
  const bf = document.getElementById("bookFile");
  if(bf) bf.onchange = e=>{
    const f = e.target.files[0]; if(!f) return;
    const ext = (f.name.split('.').pop()||"").toLowerCase();
    const meta = document.getElementById("bookMeta");
    const ob = document.getElementById("btnOpenBook");

    if(ext === "pdf"){
      const r = new FileReader();
      r.onload = ()=>{
        bookData = {name:f.name, type:"pdf", data:r.result};
        try{ localStorage.setItem(BOOK_KEY, JSON.stringify({name:f.name, type:"pdf"})); }catch(err){}
        meta.textContent = "当前书架：《"+f.name+"》（PDF · 本会话有效）";
        ob.disabled = false;
        toast("《"+f.name+"》已放进书架 📚");
      };
      r.readAsArrayBuffer(f);
    } else if(ext === "docx" || ext === "doc"){
      const r = new FileReader();
      r.onload = async ()=>{
        try{
          if(!window.mammoth){ toast("Word解析库未加载，请检查网络", true); return; }
          if(ext === "doc"){ toast("旧版 .doc 格式支持有限，建议另存为 .docx", true); }
          const result = await mammoth.convertToHtml({arrayBuffer:r.result});
          bookData = {name:f.name, type:"html", text:result.value||"<p style='color:#999'>文档内容为空</p>"};
          try{ localStorage.setItem(BOOK_KEY, JSON.stringify({name:f.name, type:"html", text:result.value})); }catch(err){ toast("文档较大，本次有效", true); }
          meta.textContent = "当前书架：《"+f.name+"》（Word）";
          ob.disabled = false;
          toast("《"+f.name+"》已放进书架 📚");
        }catch(err){ toast("Word解析失败："+err.message, true); }
      };
      r.readAsArrayBuffer(f);
    } else if(ext === "epub"){
      const r = new FileReader();
      r.onload = ()=>{
        bookData = {name:f.name, type:"epub", data:r.result};
        try{ localStorage.setItem(BOOK_KEY, JSON.stringify({name:f.name, type:"epub"})); }catch(err){}
        meta.textContent = "当前书架：《"+f.name+"》（EPUB · 本会话有效）";
        ob.disabled = false;
        toast("《"+f.name+"》已放进书架 📚");
      };
      r.readAsArrayBuffer(f);
    } else {
      const r = new FileReader();
      r.onload = ()=>{
        let text = String(r.result||"");
        bookData = {name:f.name, type:"text", text};
        try{ localStorage.setItem(BOOK_KEY, JSON.stringify({name:f.name, type:"text", text})); }catch(err){ toast("这本书有点大，本次阅读期间有效，无法长期保存", true); }
        meta.textContent = "当前书架：《"+f.name+"》";
        ob.disabled = false;
        toast("《"+f.name+"》已放进书架 📚");
      };
      r.readAsText(f, "utf-8");
    }
  };
  const ob = document.getElementById("btnOpenBook");
  if(ob) ob.onclick = openReader;
  const pt = document.getElementById("btnPaperToggle");
  if(pt){
    const upd = ()=>{ pt.textContent = db.day.tasks.reading.running ? "⏸ 暂停计时" : "▶ 开始计时"; };
    upd(); pt.onclick = ()=>{ db.day.tasks.reading.running = !db.day.tasks.reading.running; save(); upd(); };
  }
  const t = db.day.tasks.reading;
  document.getElementById("rdMode").textContent = t.running ? "计时中…" : "已暂停";
}
function openReader(){
  if(!bookData){ toast("请先上传电子书", true); return; }
  if(bookData.needReupload){ toast("该文档需重新上传（PDF/EPUB不支持持久存储），请重新选择文件", true); return; }
  document.getElementById("readerTitle").textContent = "《"+bookData.name+"》";
  const rc = document.getElementById("readerContent");
  rc.style.fontSize = db.settings.readerFont + "px";
  document.getElementById("readerOverlay").classList.add("open");
  db.day.tasks.reading.running = true; save();
  if(bookData.type === "pdf"){
    rc.innerHTML = "<p style='text-align:center;color:#999;padding:40px'>正在加载 PDF…</p>";
    renderPDF(bookData.data);
  } else if(bookData.type === "epub"){
    rc.innerHTML = "<p style='text-align:center;color:#999;padding:40px'>正在加载 EPUB…</p>";
    renderEPUB(bookData.data);
  } else if(bookData.type === "html"){
    rc.innerHTML = bookData.text;
  } else {
    rc.textContent = bookData.text;
  }
  document.getElementById("readerBody").scrollTop = 0;
}
function closeReader(){
  document.getElementById("readerOverlay").classList.remove("open");
  if(bookData && bookData.rendition){
    try{ bookData.rendition.destroy(); }catch(e){}
    bookData.rendition = null; bookData.book = null;
  }
  document.getElementById("readerContent").innerHTML = "";
  db.day.tasks.reading.running = false; save();
}

/* PDF 渲染（pdf.js 逐页画 canvas） */
async function renderPDF(buf){
  const rc = document.getElementById("readerContent");
  try{
    if(!window.pdfjsLib){ rc.innerHTML = "<p style='color:#c00;padding:20px'>PDF 解析库未加载，请检查网络连接后刷新</p>"; return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({data: buf}).promise;
    rc.innerHTML = "";
    const total = pdf.numPages;
    for(let i=1; i<=total; i++){
      const page = await pdf.getPage(i);
      const canvas = document.createElement("canvas");
      const viewport = page.getViewport({scale: 1.5});
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = "100%";
      canvas.style.maxWidth = "720px";
      canvas.style.margin = "0 auto 16px";
      canvas.style.display = "block";
      canvas.style.boxShadow = "0 2px 10px rgba(0,0,0,.12)";
      await page.render({canvasContext: canvas.getContext("2d"), viewport}).promise;
      rc.appendChild(canvas);
      if(i === 1) rc.scrollIntoView();
    }
  }catch(err){ rc.innerHTML = "<p style='color:#c00;padding:20px'>PDF 加载失败："+err.message+"</p>"; }
}

/* EPUB 渲染（epub.js） */
function renderEPUB(buf){
  const rc = document.getElementById("readerContent");
  try{
    if(!window.ePub){ rc.innerHTML = "<p style='color:#c00;padding:20px'>EPUB 解析库未加载，请检查网络连接后刷新</p>"; return; }
    rc.innerHTML = "<div id='epubViewer' style='min-height:560px'></div>";
    const book = ePub(buf);
    const rendition = book.renderTo("epubViewer", {width:"100%", height:"560px", allowScriptedContent:true});
    rendition.display();
    bookData.rendition = rendition;
    bookData.book = book;
  }catch(err){ rc.innerHTML = "<p style='color:#c00;padding:20px'>EPUB 加载失败："+err.message+"</p>"; }
}

/* ---------- 英语 ---------- */
const LEVELS = { cz:"初中", gz:"高中", cet:"四六级", ielts:"雅思" };
function dailyWords(){
  const list = window.WORDS[db.settings.englishLevel] || window.WORDS.cz;
  const d = new Date();
  const dayNum = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()/86400000);
  const start = (dayNum*40) % list.length;
  const out = [];
  for(let i=0;i<40;i++) out.push(list[(start+i)%list.length]);
  return out;
}
function parseWord(s){ const p = s.split("|"); return { w:p[0], ph:p[1]||"", cn:p[2]||"" }; }
function panelEnglish(){
  const t = db.day.tasks.english;
  const words = dailyWords();
  if(t.done){
    let html = doneBannerHTML("今日 40 个单词已全部过完！");
    html += `<div class="sec-title">今日词单回顾（${LEVELS[db.settings.englishLevel]}）</div><div class="photo-grid" style="align-items:flex-start">`;
    words.forEach((s,i)=>{ const w=parseWord(s); html += `<div style="width:150px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:12.5px">
      <b style="color:var(--purple-text)">${i+1}. ${w.w}</b><br><span style="color:var(--text2)">${w.ph}</span><br>${w.cn}</div>`; });
    return html + "</div>";
  }
  const cur = parseWord(words[t.idx]);
  const pct = t.idx/40*100;
  return `
  <div class="level-pick">${Object.keys(LEVELS).map(k=>
    `<button class="mode-tab ${db.settings.englishLevel===k?"active":""}" onclick="App.setLevel('${k}')">${LEVELS[k]}</button>`).join("")}
  </div>
  <div class="word-idx">今日进度：${t.idx} / 40 · ${LEVELS[db.settings.englishLevel]}词汇 · 每天自动换新词</div>
  <div class="timer-progress" style="max-width:520px;margin:0 auto 16px"><i style="width:${pct}%"></i></div>
  <div class="word-card">
    <div style="font-size:12px;color:var(--text2)">${t.idx+1} / 40</div>
    <div class="word-en">${cur.w}</div>
    <div class="word-ph">${cur.ph}</div>
    <div class="word-cn">${cur.cn}</div>
    <div class="word-acts">
      <button class="btn-listen" title="听发音" onclick="App.speak()">🔊</button>
      <button class="btn-word" onclick="App.nextWord()">继续 →</button>
    </div>
  </div>
  <p class="hint" style="text-align:center">点 🔊 听发音并跟读；40 个过完任务自动打勾 ✓</p>`;
}
function bindEnglish(){ /* 按钮均为 inline */ }
function speakWord(){
  const words = dailyWords();
  const t = db.day.tasks.english;
  if(t.done){ toast("今日单词已背完啦"); return; }
  const w = parseWord(words[t.idx]);
  try{
    const u = new SpeechSynthesisUtterance(w.w);
    u.lang = "en-US"; u.rate = 0.85;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }catch(e){ toast("当前设备不支持朗读", true); }
}
function nextWord(){
  const t = db.day.tasks.english;
  t.idx++;
  if(t.idx >= 40){ completeTask("english"); }
  else { save(); renderPanel(); setTimeout(speakWord, 120); }
}

/* ---------- 瑜伽 ---------- */
const POSES = [
  { n:"祈祷式", e:"Prayer Pose",
    head:[100,48], bones:[[[100,62],[100,112]],[[100,112],[88,145]],[[88,145],[88,182]],[[100,112],[112,145]],[[112,145],[112,182]],[[100,62],[82,92]],[[82,92],[100,88]],[[100,62],[118,92]],[[118,92],[100,88]]] },
  { n:"展臂式", e:"Raised Arms Pose",
    head:[100,42], bones:[[[100,56],[100,110]],[[100,110],[87,145]],[[87,145],[87,182]],[[100,110],[113,145]],[[113,145],[113,182]],[[100,56],[86,52]],[[86,52],[88,24]],[[100,56],[114,52]],[[114,52],[112,24]]] },
  { n:"前屈式", e:"Forward Fold",
    head:[100,176], bones:[[[100,168],[100,118]],[[100,118],[88,148]],[[88,148],[88,182]],[[100,118],[112,148]],[[112,148],[112,182]],[[100,168],[86,172]],[[86,172],[74,184]],[[100,168],[114,172]],[[114,172],[126,184]]] },
  { n:"骑马式（右腿后）", e:"Low Lunge R",
    head:[100,50], bones:[[[102,64],[106,126]],[[106,126],[74,140]],[[74,140],[72,182]],[[106,126],[140,158]],[[140,158],[162,182]],[[102,64],[88,52]],[[88,52],[84,24]],[[102,64],[116,52]],[[116,52],[120,24]]] },
  { n:"平板式", e:"Plank Pose",
    head:[42,122], bones:[[[52,130],[112,126]],[[112,126],[140,138]],[[140,138],[164,152]],[[164,152],[172,166]],[[52,130],[50,182]],[[112,126],[118,182]]] },
  { n:"四柱式", e:"Four-Limbed Staff",
    head:[46,148], bones:[[[56,156],[114,150]],[[114,150],[142,160]],[[142,160],[164,172]],[[164,172],[172,184]],[[56,156],[52,185]],[[114,150],[120,182]]] },
  { n:"上犬式", e:"Upward Dog",
    head:[50,96], bones:[[[60,106],[114,148]],[[114,148],[146,166]],[[146,166],[166,182]],[[60,106],[52,184]],[[114,148],[124,180]]] },
  { n:"下犬式", e:"Downward Dog",
    head:[74,156], bones:[[[82,140],[114,86]],[[114,86],[142,134]],[[142,134],[166,184]],[[82,140],[52,184]],[[82,140],[92,158]]] },
  { n:"骑马式（左腿后）", e:"Low Lunge L",
    head:[100,50], bones:[[[98,64],[94,126]],[[94,126],[126,140]],[[126,140],[128,182]],[[94,126],[60,158]],[[60,158],[38,182]],[[98,64],[84,52]],[[84,52],[80,24]],[[98,64],[112,52]],[[112,52],[116,24]]] },
  { n:"前屈式", e:"Forward Fold",
    head:[100,176], bones:[[[100,168],[100,118]],[[100,118],[88,148]],[[88,148],[88,182]],[[100,118],[112,148]],[[112,148],[112,182]],[[100,168],[86,172]],[[86,172],[74,184]],[[100,168],[114,172]],[[114,172],[126,184]]] },
  { n:"展臂式", e:"Raised Arms Pose",
    head:[100,42], bones:[[[100,56],[100,110]],[[100,110],[87,145]],[[87,145],[87,182]],[[100,110],[113,145]],[[113,145],[113,182]],[[100,56],[86,52]],[[86,52],[88,24]],[[100,56],[114,52]],[[114,52],[112,24]]] },
  { n:"祈祷式", e:"Prayer Pose",
    head:[100,48], bones:[[[100,62],[100,112]],[[100,112],[88,145]],[[88,145],[88,182]],[[100,112],[112,145]],[[112,145],[112,182]],[[100,62],[82,92]],[[82,92],[100,88]],[[100,62],[118,92]],[[118,92],[100,88]]] }
];
let poseIdx = 0, poseTimer = null;
function poseSVG(p){
  let s = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">`;
  s += `<line x1="20" y1="186" x2="180" y2="186" stroke="#e0d4f5" stroke-width="3" stroke-linecap="round"/>`;
  p.bones.forEach(b=>{
    s += `<line x1="${b[0][0]}" y1="${b[0][1]}" x2="${b[1][0]}" y2="${b[1][1]}" stroke="#8467c3" stroke-width="5" stroke-linecap="round"/>`;
  });
  const pts = new Set(); p.bones.forEach(b=>{ pts.add(b[0].join(",")); pts.add(b[1].join(",")); });
  pts.forEach(k=>{ const [x,y]=k.split(","); s += `<circle cx="${x}" cy="${y}" r="4" fill="#b28fe0"/>`; });
  s += `<circle cx="${p.head[0]}" cy="${p.head[1]}" r="12" fill="#ffffff" stroke="#8467c3" stroke-width="4"/>`;
  s += `</svg>`;
  return s;
}
function panelYoga(){
  const t = db.day.tasks.yoga;
  const url = db.settings.yogaUrl;
  let html = timerBoxHTML("yoga", `<button class="btn btn-primary" id="yogaToggle">${t.running?"⏸ 暂停跟练":"▶ 开始跟练"}</button>`);
  html += `
  <div class="sec-title">拜日十二式 · 跟练</div>
  <div class="yoga-wrap">
    <div class="yoga-stage">
      <div id="poseBox">${poseSVG(POSES[poseIdx])}</div>
      <div class="pose-name" id="poseName">${POSES[poseIdx].n}</div>
      <div class="pose-sub" id="poseSub">第 ${poseIdx+1}/12 式 · ${POSES[poseIdx].e}</div>
      <div class="pose-dots" id="poseDots">${POSES.map((_,i)=>`<i class="${i===poseIdx?"on":""}"></i>`).join("")}</div>
    </div>
    <div style="flex:1;min-width:240px">
      <div class="mode-card">
        <div class="sec-title" style="margin-top:0">使用自己的跟练视频（可选）</div>
        <div class="url-row">
          <input id="yogaUrl" placeholder="粘贴视频链接（B站 / mp4直链等）" value="${url?esc(url):""}">
          <button class="btn btn-primary" onclick="App.saveYogaUrl()">保存</button>
        </div>
        <p class="hint">不填也可以——左侧是内置的拜日十二式动画引导，跟一式换一式（约5秒/式，一轮1分钟）。<br>点「开始跟练」后开始计时，达到目标时长自动打勾 ✓</p>
      </div>
      <div id="yogaEmbed"></div>
    </div>
  </div>`;
  if(t.done) html = doneBannerHTML("今日瑜伽已完成，身体舒展开了～") + html;
  return html;
}
function bindYoga(){
  const tg = document.getElementById("yogaToggle");
  tg.onclick = ()=>{
    const t = db.day.tasks.yoga;
    t.running = !t.running; save();
    tg.textContent = t.running ? "⏸ 暂停跟练" : "▶ 开始跟练";
    applyYogaEmbed();
    if(t.running) startPoseAnim();
  };
  if(db.day.tasks.yoga.running){ startPoseAnim(); applyYogaEmbed(); }
}
function applyYogaEmbed(){
  const box = document.getElementById("yogaEmbed"); if(!box) return;
  const url = db.settings.yogaUrl;
  box.innerHTML = (url && db.day.tasks.yoga.running) ? embedHTML(url) : "";
}
function startPoseAnim(){
  stopPoseAnim();
  poseTimer = setInterval(()=>{
    poseIdx = (poseIdx+1) % 12;
    const box = document.getElementById("poseBox"); if(!box){ stopPoseAnim(); return; }
    box.innerHTML = poseSVG(POSES[poseIdx]);
    document.getElementById("poseName").textContent = POSES[poseIdx].n;
    document.getElementById("poseSub").textContent = "第 "+(poseIdx+1)+"/12 式 · "+POSES[poseIdx].e;
    document.querySelectorAll("#poseDots i").forEach((d,i)=>d.classList.toggle("on", i===poseIdx));
  }, 5000);
}
function stopPoseAnim(){ if(poseTimer){ clearInterval(poseTimer); poseTimer = null; } }

/* ---------- 钢琴 ---------- */
let metroTimer = null, audioCtx = null;
function panelPiano(){
  const t = db.day.tasks.piano;
  const piece = db.settings.pianoPiece || "送别";
  let html = timerBoxHTML("piano", `<button class="btn btn-primary" id="pianoToggle">${t.running?"⏸ 暂停练习":"▶ 开始跟练"}</button>`);
  html += `
  <div class="mode-card">
    <div class="sec-title" style="margin-top:0">当前练习曲目</div>
    <div class="url-row">
      <input id="pianoPiece" value="${esc(piece)}" style="max-width:180px" placeholder="曲目名">
      <input id="pianoUrl" value="${esc(db.settings.pianoUrl)}" placeholder="跟练视频链接（B站 / mp4直链等，可选）">
      <button class="btn btn-primary" onclick="App.savePiano()">保存</button>
    </div>
  </div>
  <div class="yoga-wrap">
    <div style="flex:1;min-width:230px">
      <div class="sec-title">《${esc(piece)}》简谱参考</div>
      <div class="score-lines">
        长亭外 <span class="note-nums">5 3 5 1̇</span><br>
        古道边 <span class="note-nums">6 1̇ 1̇ –</span><br>
        芳草碧连天 <span class="note-nums">5 1̇ 6 5 3 –</span><br>
        晚风拂柳笛声残 <span class="note-nums">5 3 5 1̇ 7 6 1̇ 1̇ –</span><br>
        夕阳山外山 <span class="note-nums">5 1̇ 6 5 2 –</span>
      </div>
      <p class="hint">跟着视频或谱子练习，达到目标时长自动打勾 ✓</p>
    </div>
    <div style="flex:1;min-width:230px">
      <div class="sec-title">节拍器</div>
      <div class="metro-row">
        <button class="btn btn-primary" id="metroBtn" style="padding:8px 18px">▶ 开</button>
        <span>BPM <b id="bpmVal">72</b></span>
        <input type="range" id="bpmRange" min="40" max="180" value="72">
      </div>
      <div id="pianoEmbed">${ (db.settings.pianoUrl && t.running) ? embedHTML(db.settings.pianoUrl) : "" }</div>
    </div>
  </div>`;
  if(t.done) html = doneBannerHTML("今日钢琴练习完成，指尖越来越灵巧～") + html;
  return html;
}
function bindPiano(){
  const tg = document.getElementById("pianoToggle");
  tg.onclick = ()=>{
    const t = db.day.tasks.piano;
    t.running = !t.running; save();
    tg.textContent = t.running ? "⏸ 暂停练习" : "▶ 开始跟练";
    const box = document.getElementById("pianoEmbed");
    if(box) box.innerHTML = (db.settings.pianoUrl && t.running) ? embedHTML(db.settings.pianoUrl) : "";
  };
  const mb = document.getElementById("metroBtn");
  mb.onclick = toggleMetro;
  const rg = document.getElementById("bpmRange");
  rg.oninput = ()=>{ document.getElementById("bpmVal").textContent = rg.value; };
}
function toggleMetro(){
  const btn = document.getElementById("metroBtn"); if(!btn) return;
  if(metroTimer){ stopMetro(); return; }
  if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ toast("设备不支持节拍器", true); return; } }
  let beat = 0;
  const bpm = parseInt(document.getElementById("bpmRange").value,10) || 72;
  const tick = ()=>{
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = (beat%4===0) ? 1320 : 880;
    g.gain.setValueAtTime(0.5, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.09);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.1);
    beat++;
  };
  tick();
  metroTimer = setInterval(tick, 60000/bpm);
  btn.textContent = "⏸ 关";
}
function stopMetro(){ if(metroTimer){ clearInterval(metroTimer); metroTimer = null; const b=document.getElementById("metroBtn"); if(b) b.textContent = "▶ 开"; } }

/* ---------- 禅绕画 ---------- */
function weekStartKey(){
  const d = new Date(); const day = (d.getDay()+6)%7; // 周一为一周开始
  d.setDate(d.getDate()-day); return fmtDate(d);
}
function zentangleWeekCount(){
  const ws = weekStartKey();
  return db.zentangleDates.filter(k=>k>=ws && k<=todayKey()).length;
}
function panelZentangle(){
  const t = db.day.tasks.zentangle;
  const wk = zentangleWeekCount();
  let html = `<div class="week-badge">📅 本周已完成 <b>${wk}</b> / 2 幅</div>`;
  if(t.done) html += doneBannerHTML("今日禅绕画已完成，心静如水 ✨");
  html += `
  <div class="upload-zone" onclick="document.getElementById('ztFile').click()">
    <div style="font-size:34px">🎨</div>
    <div>点击上传今天的禅绕画作品</div>
    <div style="font-size:12px;margin-top:4px">上传成功即完成今日禅绕任务（每周至少 2 幅）</div>
  </div>
  <input type="file" id="ztFile" accept="image/*" style="display:none">
  ${t.photos.length ? `<div class="sec-title" style="margin-top:14px">今日作品</div><div class="photo-grid">${t.photos.map(p=>`<img src="${p}" alt="禅绕画">`).join("")}</div>` : ""}
  <p class="hint">禅绕画没有时长要求，上传作品照片后任务自动打勾 ✓</p>`;
  return html;
}
function bindZentangle(){
  const f = document.getElementById("ztFile");
  f.onchange = e=>{
    const file = e.target.files[0]; if(!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = ()=>{
      const c = document.createElement("canvas");
      const max = 520;
      const r = Math.min(1, max/Math.max(img.width, img.height));
      c.width = img.width*r; c.height = img.height*r;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", 0.72);
      URL.revokeObjectURL(url);
      db.day.tasks.zentangle.photos.push(data);
      save();
      if(!db.day.tasks.zentangle.done) completeTask("zentangle");
      else { renderPanel(); toast("又添一幅作品 ✨"); }
    };
    img.src = url;
  };
}

/* ---------- 通用 ---------- */
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }
function embedHTML(url){
  url = String(url||"").trim();
  if(!url) return "";
  const bv = url.match(/bilibili\.com\/video\/(BV[\w]+)/i) || url.match(/b23\.tv\/(\w+)/i);
  if(bv && url.indexOf("BV")>-1){
    return `<div class="embed-box"><iframe src="https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0&danmaku=0" allowfullscreen></iframe></div>`;
  }
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if(yt) return `<div class="embed-box"><iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen></iframe></div>`;
  if(/\.(mp4|webm|m4v)(\?|$)/i.test(url)) return `<div class="embed-box"><video src="${esc(url)}" controls playsinline></video></div>`;
  return `<div class="embed-box"><iframe src="${esc(url)}" allowfullscreen></iframe></div>`;
}
function bindPanel(id){
  const m = { reading:bindReading, english:bindEnglish, yoga:bindYoga, piano:bindPiano, zentangle:bindZentangle };
  m[id]();
}

/* ---------------- 小猫渲染 ---------------- */
const QUAL_COLORS = ["#9db4a0", "#b28fe0", "#e0b64f"];
function qualColor(id){ const q = db.owned[id]; return (q===undefined) ? null : QUAL_COLORS[q]; }
function catSVG(){
  const idx = stageIdx();
  const s = [0.55,0.7,0.85,0.95,1.05][idx];
  const alive = db.cat.alive;
  const bodyFill = alive ? "#ffffff" : "#cfd2da";
  const lineC = alive ? "#d9cdea" : "#b9bcc7";
  const bodyRx = [26,28,29,31,36][idx], bodyRy = [22,23,24,25,27][idx];
  const headR  = [24,22,21,20,21][idx];
  let itemsBack = "", itemsFront = "";
  const cTree = qualColor("tree"), cLitter = qualColor("litter"), cDeco = qualColor("deco"),
        cTeaser = qualColor("teaser"), cBell = qualColor("bell");
  if(cTree){
    itemsBack += `<g>
      <rect x="196" y="64" width="9" height="92" rx="3" fill="${cTree}"/>
      <ellipse cx="200" cy="156" rx="20" ry="6" fill="${cTree}" opacity=".85"/>
      <ellipse cx="200" cy="60" rx="24" ry="8" fill="${cTree}"/>
      <line x1="200" y1="60" x2="200" y2="44" stroke="#a89bc0" stroke-width="1.5"/>
      <circle cx="200" cy="41" r="4.5" fill="${cDeco||"#e0b64f"}"/>
    </g>`;
  }
  if(cLitter){
    itemsBack += `<g>
      <path d="M18 150 L62 150 L55 122 L25 122 Z" fill="${cLitter}" opacity=".9"/>
      <ellipse cx="40" cy="122" rx="16" ry="5" fill="#ffffff" stroke="${cLitter}" stroke-width="2"/>
    </g>`;
  }
  if(cDeco){
    const cols = [cDeco, "#b28fe0", "#ffffff"];
    let gar = `<path d="M4 14 Q120 34 236 14" stroke="${cDeco}" stroke-width="2" fill="none"/>`;
    for(let i=0;i<8;i++){
      const x = 12 + i*30, y = 18 + Math.sin(i/7*Math.PI)*13;
      gar += `<circle cx="${x}" cy="${y+6}" r="3.5" fill="${cols[i%3]}"/>`;
    }
    itemsBack += gar;
  }
  if(cTeaser){
    itemsFront += `<g>
      <line x1="196" y1="122" x2="158" y2="58" stroke="#c9a06a" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse cx="153" cy="52" rx="6" ry="13" fill="${cTeaser}" transform="rotate(-32 153 52)"/>
      <ellipse cx="162" cy="49" rx="6" ry="13" fill="${cTeaser}" opacity=".7" transform="rotate(-8 162 49)"/>
    </g>`;
  }
  // 猫本体（局部坐标：脚底为原点）
  const g = `
    <g transform="translate(112,156) scale(${s})">
      ${alive ? "" : `<ellipse cx="0" cy="-108" rx="17" ry="5" fill="none" stroke="#c9b7e8" stroke-width="2.5"/>`}
      <path d="M ${bodyRx-4} -10 Q ${bodyRx+22} -6 ${bodyRx+14} -34" stroke="${lineC}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <ellipse cx="0" cy="-24" rx="${bodyRx}" ry="${bodyRy}" fill="${bodyFill}" stroke="${lineC}" stroke-width="2.5"/>
      <ellipse cx="-9" cy="-4" rx="7" ry="4.5" fill="${bodyFill}" stroke="${lineC}" stroke-width="2"/>
      <ellipse cx="9" cy="-4" rx="7" ry="4.5" fill="${bodyFill}" stroke="${lineC}" stroke-width="2"/>
      <g>
        <polygon points="-13,-${58+headR*0.5} -20,-${58+headR+14} -2,-${58+headR*0.75}" fill="${bodyFill}" stroke="${lineC}" stroke-width="2"/>
        <polygon points="13,-${58+headR*0.5} 20,-${58+headR+14} 2,-${58+headR*0.75}" fill="${bodyFill}" stroke="${lineC}" stroke-width="2"/>
        <polygon points="-13,-${58+headR*0.6} -17,-${58+headR+8} -5,-${58+headR*0.8}" fill="#f3cddd"/>
        <polygon points="13,-${58+headR*0.6} 17,-${58+headR+8} 5,-${58+headR*0.8}" fill="#f3cddd"/>
        <circle cx="0" cy="-58" r="${headR}" fill="${bodyFill}" stroke="${lineC}" stroke-width="2.5"/>
        ${catFace(idx, alive)}
        ${cBell ? `<path d="M -${headR*0.72} -40 Q 0 -32 ${headR*0.72} -40" stroke="${cBell}" stroke-width="3.5" fill="none"/>
                   <circle cx="0" cy="-35" r="4" fill="${cBell}" stroke="#fff" stroke-width="1"/>` : ""}
      </g>
    </g>`;
  return `<svg viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="120" cy="164" rx="86" ry="10" fill="#e4dbf4" opacity=".7"/>
    ${itemsBack}${g}${itemsFront}
    ${alive ? "" : `<text x="120" y="34" text-anchor="middle" font-size="13" fill="#8d82a6">💤</text>`}
  </svg>`;
}
function catFace(idx, alive){
  const eyeY = -62;
  if(!alive){
    return `<g stroke="#8d86a0" stroke-width="2.2" stroke-linecap="round">
      <line x1="-13" y1="${eyeY-3}" x2="-5" y2="${eyeY+3}"/><line x1="-5" y1="${eyeY-3}" x2="-13" y2="${eyeY+3}"/>
      <line x1="5" y1="${eyeY-3}" x2="13" y2="${eyeY+3}"/><line x1="13" y1="${eyeY-3}" x2="5" y2="${eyeY+3}"/>
    </g><path d="M -3 -52 Q 0 -49 3 -52" stroke="#8d86a0" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  }
  let face = "";
  if(idx === 0){
    face = `<path d="M -13 ${eyeY} Q -9 ${eyeY+4} -5 ${eyeY}" stroke="#5b4a8a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
            <path d="M 5 ${eyeY} Q 9 ${eyeY+4} 13 ${eyeY}" stroke="#5b4a8a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  } else {
    face = `<circle cx="-9" cy="${eyeY}" r="3.2" fill="#5b4a8a"/><circle cx="9" cy="${eyeY}" r="3.2" fill="#5b4a8a"/>
            <circle cx="-8" cy="${eyeY-1}" r="1" fill="#fff"/><circle cx="10" cy="${eyeY-1}" r="1" fill="#fff"/>`;
  }
  const wl = idx>=2 ? 16 : 11;
  face += `<polygon points="-2,-54 2,-54 0,-51" fill="#e88fa4"/>
    <path d="M -4 -51 Q -2 -48 0 -51 Q 2 -48 4 -51" stroke="#5b4a8a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <g stroke="#c9bfe0" stroke-width="1.3" stroke-linecap="round">
      <line x1="-14" y1="-57" x2="${-14-wl}" y2="-58"/>
      <line x1="-14" y1="-54" x2="${-14-wl}" y2="-53"/>
      <line x1="14" y1="-57" x2="${14+wl}" y2="-58"/>
      <line x1="14" y1="-54" x2="${14+wl}" y2="-53"/>
    </g>
    <ellipse cx="-16" cy="-50" rx="3.5" ry="2.2" fill="#f5cfd8" opacity=".8"/>
    <ellipse cx="16" cy="-50" rx="3.5" ry="2.2" fill="#f5cfd8" opacity=".8"/>`;
  return face;
}
function renderCat(){
  document.getElementById("catScene").innerHTML = catSVG();
  const idx = stageIdx();
  document.getElementById("catStageName").textContent = "· " + STAGES[idx].name;
  const next = STAGES[idx+1];
  if(next){
    const base = STAGES[idx].min;
    document.getElementById("catGrowthText").textContent = `喂猫条成长：${db.cat.growth} / ${next.min} 根到「${next.name}」`;
    document.getElementById("growthBar").style.width = Math.min(100,(db.cat.growth-base)/(next.min-base)*100)+"%";
  } else {
    document.getElementById("catGrowthText").textContent = "已经是最大最圆的团子啦！";
    document.getElementById("growthBar").style.width = "100%";
  }
  document.getElementById("catPoints").textContent = db.points;
  document.getElementById("catTreats").textContent = db.treats;
  // 连续完成天数
  let streak = 0;
  for(let i=0;i<400;i++){
    const k = keyOffset(-i);
    if(k < db.firstUse) break;
    const h = db.history[k];
    if(h && h.count>=3) streak++;
    else if(i===0) continue; // 今天还没达标不算断
    else break;
  }
  document.getElementById("catStreak").textContent = "🔥 连续达标 " + streak + " 天";
  document.getElementById("deadMask").style.display = db.cat.alive ? "none" : "flex";
  const bf = document.getElementById("btnFeed");
  bf.disabled = !db.cat.alive || db.treats<=0;
  bf.textContent = db.cat.alive ? "喂猫条（剩 "+db.treats+"）" : "团子不在…";
}

/* ---------------- 喂猫 ---------------- */
function feed(){
  if(!db.cat.alive){ toast("团子还在喵星，先连续两天完成任务救它回来吧", true); return; }
  if(db.treats<=0){ toast("没有猫条啦～今天完成三项任务可获得一根", true); return; }
  db.treats--; db.cat.growth++;
  const before = stageIdx(); save();
  renderAll();
  const after = stageIdx();
  if(after>before) toast("🎉 团子长大了！现在是「"+STAGES[after].name+"」");
  else toast("团子吃得津津有味，满足地眯起了眼 😺");
}

/* ---------------- 商店 ---------------- */
const SHOP = [
  { id:"litter",  name:"猫砂盆",   icon:"🧺", desc:"干净的小猫砂盆",       prices:[30,70,150] },
  { id:"teaser",  name:"逗猫棒",   icon:"🪶", desc:"团子最爱的玩具",       prices:[25,60,120] },
  { id:"bell",    name:"铃铛项圈", icon:"🔔", desc:"走起路来叮铃铃～",     prices:[20,50,100] },
  { id:"tree",    name:"猫爬架",   icon:"🗼", desc:"能上蹿下跳的架子",     prices:[60,140,300] },
  { id:"deco",    name:"装饰彩灯", icon:"✨", desc:"把猫窝装点得漂漂亮亮", prices:[30,80,180] }
];
const QUALITIES = [{n:"普通",c:"#9db4a0"},{n:"优良",c:"#b28fe0"},{n:"精致",c:"#e0b64f"}];
function renderShop(){
  document.getElementById("shopPoints").textContent = db.points;
  const box = document.getElementById("shopList");
  box.innerHTML = SHOP.map(it=>{
    const owned = db.owned[it.id];
    return `<div class="shop-item">
      <div class="ic">${it.icon}</div>
      <div class="nm"><b>${it.name}</b><span>${it.desc}${owned!==undefined ? " · 已装备「"+QUALITIES[owned].n+"」" : ""}</span></div>
      <div class="quality-row">${QUALITIES.map((q,qi)=>{
        const isOwned = owned!==undefined && owned>=qi;
        const canBuy = !isOwned && db.points>=it.prices[qi];
        return `<div class="q-chip ${isOwned?"owned":""}">
          <span class="q-dot" style="background:${q.c}"></span>
          <span class="q-nm">${q.n}</span>
          <span class="q-pr">${it.prices[qi]}分</span>
          <button class="q-btn" ${(!isOwned&&!canBuy)?"disabled":""} onclick="App.buy('${it.id}',${qi})">${isOwned?"已拥有":"购买"}</button>
        </div>`;}).join("")}
      </div>
    </div>`;
  }).join("");
}
function buy(id, q){
  const it = SHOP.find(s=>s.id===id);
  const owned = db.owned[id];
  if(owned!==undefined && owned>=q){ toast("已经拥有这件（或更好的）啦"); return; }
  if(db.points < it.prices[q]){ toast("积分不够，先去做任务赚积分吧～", true); return; }
  db.points -= it.prices[q];
  db.owned[id] = Math.max(owned===undefined?-1:owned, q);
  save(); renderShop(); renderCat(); renderSidebar();
  toast("买到了「"+it.name+"·"+QUALITIES[q].n+"」！已放进团子的窝 🎁");
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg, warn){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = warn ? "warn" : "";
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>el.classList.remove("show"), 3200);
}

/* ---------------- 事件绑定 ---------------- */
document.getElementById("taskNav").addEventListener("click", e=>{
  const btn = e.target.closest(".task-btn"); if(!btn) return;
  currentTask = btn.dataset.task;
  renderAll();
});
document.getElementById("btnFeed").onclick = feed;
document.getElementById("btnShop").onclick = ()=>{ renderShop(); document.getElementById("shopModal").classList.add("open"); };
document.getElementById("shopClose").onclick = ()=>document.getElementById("shopModal").classList.remove("open");
document.getElementById("shopModal").addEventListener("click", e=>{ if(e.target.id==="shopModal") e.target.classList.remove("open"); });
document.getElementById("durationInput").onchange = e=>{
  const v = Math.max(1, Math.min(600, parseInt(e.target.value,10)||1));
  db.settings.durations[currentTask] = v; save();
  const t = db.day.tasks[currentTask];
  if(!t.done && t.elapsed >= v*60) completeTask(currentTask);
  renderPanel(); renderHead();
};
document.getElementById("readerClose").onclick = closeReader;
document.getElementById("readerFontPlus").onclick = ()=>{ db.settings.readerFont = Math.min(30, db.settings.readerFont+1); save(); document.getElementById("readerContent").style.fontSize = db.settings.readerFont+"px"; };
document.getElementById("readerFontMinus").onclick = ()=>{ db.settings.readerFont = Math.max(12, db.settings.readerFont-1); save(); document.getElementById("readerContent").style.fontSize = db.settings.readerFont+"px"; };
document.getElementById("readerTimer").textContent = "";
setInterval(()=>{
  if(document.getElementById("readerOverlay").classList.contains("open"))
    document.getElementById("readerTimer").textContent = fmtSec(db.day.tasks.reading.elapsed);
},1000);
document.addEventListener("visibilitychange", ()=>{ /* 计时引擎已按 document.hidden 暂停 */ });

/* PWA 安装 */
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e=>{
  e.preventDefault(); deferredPrompt = e;
  const b = document.getElementById("btnInstall"); if(b) b.style.display = "block";
});
document.getElementById("btnInstall").onclick = async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById("btnInstall").style.display = "none";
};

/* ---------------- 全局接口 ---------------- */
window.App = {
  rdMode(m, btn){
    document.getElementById("rdEbook").style.display = m==="ebook" ? "block" : "none";
    document.getElementById("rdPaper").style.display = m==="paper" ? "block" : "none";
    document.querySelectorAll(".mode-tabs .mode-tab").forEach(b=>b.classList.remove("active"));
    if(btn) btn.classList.add("active");
  },
  setLevel(k){
    if(db.settings.englishLevel === k){ renderPanel(); return; }
    db.settings.englishLevel = k;
    db.day.tasks.english.idx = 0;
    if(!db.day.tasks.english.done){} 
    save(); renderPanel(); toast("已切换到「"+LEVELS[k]+"」词库，今天从头开始背～");
  },
  speak: speakWord,
  nextWord,
  saveYogaUrl(){
    db.settings.yogaUrl = document.getElementById("yogaUrl").value.trim(); save();
    applyYogaEmbed(); toast("视频链接已保存");
  },
  savePiano(){
    db.settings.pianoPiece = document.getElementById("pianoPiece").value.trim() || "送别";
    db.settings.pianoUrl = document.getElementById("pianoUrl").value.trim(); save();
    renderHead(); renderPanel(); toast("曲目信息已保存");
  },
  buy
};

/* ---------------- 启动 ---------------- */
ensureDay();
checkLife();
renderAll();
if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
