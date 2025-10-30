/* app.js — tf / tf-multi / mcq を一括サポート（各肢〇×付き） */
const YEARS = ["2024","2023","2022","2021","2020"];
const state = {
  year: "2024",
  idx: 0,
  data: { questions: [] },
  answers: {}, // key: questionId -> user selections
};

const el = s => document.querySelector(s);
const stage = el("#stage");
const yearSel = el("#yearSel");
const prevBtn = el("#prevBtn");
const nextBtn = el("#nextBtn");
const progressChip = el("#progressChip");

/* --------------------------
   起動
---------------------------*/
init();
async function init(){
  // 年度選択とボタン
  yearSel.addEventListener("change", async () => {
    state.year = yearSel.value;
    state.idx = 0;
    await loadYear(state.year);
    render();
  });
  prevBtn.addEventListener("click", () => nav(-1));
  nextBtn.addEventListener("click", () => nav(+1));

  // デフォルト年をURL ?y=2021 などで指定可
  const u = new URL(location.href);
  const qy = u.searchParams.get("y");
  if (qy && YEARS.includes(qy)) {
    state.year = qy;
    yearSel.value = qy;
  }

  await loadYear(state.year);
  render();
}

async function loadYear(year){
  // 例: ./2021.json を取得
  const url = `./${year}.json?v=clean-tfmulti-001`;
  try{
    const res = await fetch(url, {cache: "no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.data = normalizeDataset(json, year);
    // 既存の解答は維持
    progressChip.textContent = `${state.idx+1}/${state.data.questions.length||0}`;
  }catch(e){
    console.error(e);
    state.data = {questions:[]};
    stage.innerHTML = `
      <div class="card">
        <div class="text-red-600 font-semibold mb-2">データ読み込みエラー</div>
        <div class="muted">「${year}.json」が見つからないか、形式が異なります。</div>
      </div>`;
  }
}

function normalizeDataset(json, year){
  const out = {year, questions:[]};
  if (!json || !Array.isArray(json.questions)) return out;

  for (const q of json.questions){
    const id = q.id || `${year}-${String(out.questions.length+1).padStart(3,"0")}`;
    const type = q.type || "tf"; // 既存の単一判定も許容
    const base = {
      id, type,
      stem: q.stem || "",
      explain: q.explain || "",
    };

    if (type === "tf-multi"){
      // 各肢（イロハニ…）を正規化
      base.items = (q.items || []).map((it, i) => ({
        label: it.label || ["イ","ロ","ハ","ニ","ホ","ヘ","ト"][i] || String(i+1),
        text: (it.text||"").trim(),
        isTrue: !!it.isTrue
      }));
    }else if (type === "mcq"){
      base.choices = (q.choices||[]).map(c => ({text:(c.text||"").trim(), isCorrect:!!c.isCorrect}));
    }else{
      base.isTrue = !!q.isTrue; // 単一〇×
    }

    out.questions.push(base);
  }
  return out;
}

/* --------------------------
   画面レンダリング
---------------------------*/
function render(){
  const qs = state.data.questions;
  if (!qs.length){
    stage.innerHTML = `
      <div class="card">この年度のデータがありません。<br/><span class="muted">JSONに "questions": [...] が必要です。</span></div>`;
    progressChip.textContent = `0/0`;
    return;
  }
  const q = qs[state.idx];
  progressChip.textContent = `${state.idx+1}/${qs.length}`;

  // 先頭で type 分岐
  if (q.type === "tf-multi") {
    renderTfMulti(q);
  } else if (q.type === "mcq") {
    renderMcq(q);
  } else {
    renderTf(q);
  }
}

function nav(d){
  const L = state.data.questions.length;
  state.idx = Math.max(0, Math.min(L-1, state.idx + d));
  render();
}

/* 単一〇× */
function renderTf(q){
  const ans = state.answers[q.id] || null;
  stage.innerHTML = `
    <div class="card">
      <div class="muted mb-1">年度 ${state.data.year} / 単一〇× 判定</div>
      <div class="text-lg sm:text-xl font-semibold mb-2">${escapeHTML(q.stem)}</div>

      <div class="my-3 flex gap-6">
        <label class="opt"><input type="radio" name="tf" value="true" ${ans==="true"?"checked":""}>〇 正しい</label>
        <label class="opt"><input type="radio" name="tf" value="false" ${ans==="false"?"checked":""}>× 誤り</label>
      </div>

      <div class="flex gap-3 mt-2">
        <button class="btn" id="markBtn">採点</button>
        <button class="btn-outline" id="expBtn">解説を表示</button>
      </div>

      <div id="resultBox" class="mt-3"></div>
      <div id="explainBox" class="mt-3 muted hidden"></div>
    </div>
  `;

  stage.querySelectorAll('input[name="tf"]').forEach(r =>
    r.addEventListener("change", e => { state.answers[q.id] = e.target.value; })
  );

  stage.querySelector("#markBtn").addEventListener("click", () => {
    const v = state.answers[q.id];
    if (v==null){ alert("答えを選んでください"); return; }
    const ok = String(q.isTrue) === v;
    stage.querySelector("#resultBox").innerHTML =
      ok ? `<div class="ok font-semibold">◎ 正解</div>` : `<div class="bad font-semibold">× 不正解</div>`;
  });
  stage.querySelector("#expBtn").addEventListener("click", () => {
    const box = stage.querySelector("#explainBox");
    box.classList.toggle("hidden");
    box.innerHTML = `<div class="divider"></div><div class="mono whitespace-pre-wrap">${escapeHTML(q.explain||"（解説は準備中）")}</div>`;
  });
}

/* 各肢〇×（イ・ロ・ハ・ニ…ごとに判定） */
function renderTfMulti(q){
  const key = q.id;
  const saved = state.answers[key] || {}; // { label -> "true"/"false" }
  const itemsHTML = (q.items||[]).map((it,i)=>`
    <div class="border rounded-md p-3 mb-3 bg-white">
      <div class="font-semibold mb-1">${escapeHTML(it.label)}．</div>
      <div class="mb-2 mono whitespace-pre-wrap">${escapeHTML(it.text)}</div>
      <div class="flex gap-6">
        <label class="opt"><input type="radio" name="tfm-${i}" value="true"  ${saved[it.label]==="true"?"checked":""}>〇 正しい</label>
        <label class="opt"><input type="radio" name="tfm-${i}" value="false" ${saved[it.label]==="false"?"checked":""}>× 誤り</label>
      </div>
      <div id="r-${i}" class="mt-2"></div>
    </div>
  `).join("");

  stage.innerHTML = `
    <div class="card">
      <div class="muted mb-1">年度 ${state.data.year} / 各肢〇×</div>
      <div class="text-lg sm:text-xl font-semibold mb-3">${escapeHTML(q.stem)}</div>
      ${itemsHTML}
      <div class="flex gap-3 mt-1">
        <button class="btn" id="markBtn">採点</button>
        <button class="btn-outline" id="expBtn">解説を表示</button>
      </div>
      <div id="explainBox" class="mt-3 muted hidden"></div>
    </div>
  `;

  // 保存
  (q.items||[]).forEach((it, i)=>{
    stage.querySelectorAll(`input[name="tfm-${i}"]`).forEach(r=>{
      r.addEventListener("change", e=>{
        const cur = state.answers[key] || {};
        cur[it.label] = e.target.value; // "true"/"false"
        state.answers[key] = cur;
      });
    });
  });

  // 採点
  stage.querySelector("#markBtn").addEventListener("click", ()=>{
    const cur = state.answers[key] || {};
    (q.items||[]).forEach((it,i)=>{
      const v = cur[it.label];
      const ok = (String(it.isTrue) === v);
      const tgt = stage.querySelector(`#r-${i}`);
      tgt.innerHTML = v==null
        ? `<div class="muted">（未回答）</div>`
        : ok ? `<div class="ok font-semibold">◎ 正解</div>` : `<div class="bad font-semibold">× 不正解</div>`;
    });
  });

  // 解説
  stage.querySelector("#expBtn").addEventListener("click", ()=>{
    const box = stage.querySelector("#explainBox");
    box.classList.toggle("hidden");
    box.innerHTML = `<div class="divider"></div><div class="mono whitespace-pre-wrap">${escapeHTML(q.explain||"（解説は準備中）")}</div>`;
  });
}

/* 4択（必要あれば） */
function renderMcq(q){
  const key = q.id;
  const saved = state.answers[key] || null;

  const choicesHTML = (q.choices||[]).map((c,i)=>`
    <label class="opt border rounded-md p-3 bg-white">
      <input type="radio" name="mcq" value="${i}" ${String(saved)===String(i)?"checked":""}>
      <span class="mono">${escapeHTML(c.text)}</span>
    </label>
  `).join("");

  stage.innerHTML = `
    <div class="card">
      <div class="muted mb-1">年度 ${state.data.year} / 4択</div>
      <div class="text-lg sm:text-xl font-semibold mb-2">${escapeHTML(q.stem)}</div>
      <div class="grid gap-3">${choicesHTML}</div>
      <div class="flex gap-3 mt-3">
        <button class="btn" id="markBtn">採点</button>
        <button class="btn-outline" id="expBtn">解説を表示</button>
      </div>
      <div id="resultBox" class="mt-3"></div>
      <div id="explainBox" class="mt-3 muted hidden"></div>
    </div>
  `;
  stage.querySelectorAll('input[name="mcq"]').forEach(r=>{
    r.addEventListener("change", e => state.answers[key] = Number(e.target.value));
  });
  stage.querySelector("#markBtn").addEventListener("click", ()=>{
    const v = state.answers[key];
    if (v==null){ alert("答えを選んでください"); return; }
    const ok = !!q.choices?.[v]?.isCorrect;
    stage.querySelector("#resultBox").innerHTML =
      ok ? `<div class="ok font-semibold">◎ 正解</div>` : `<div class="bad font-semibold">× 不正解</div>`;
  });
  stage.querySelector("#expBtn").addEventListener("click", ()=>{
    const box = stage.querySelector("#explainBox");
    box.classList.toggle("hidden");
    box.innerHTML = `<div class="divider"></div><div class="mono whitespace-pre-wrap">${escapeHTML(q.explain||"（解説は準備中）")}</div>`;
  });
}

/* util */
function escapeHTML(s=""){return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]))}
