/* app.js — tf-multi 採点強化版（真偽の正規化＆未定義検出） */
const YEARS = ["2024","2023","2022","2021","2020"];
const DATA_VERSION = "tfm-fix-002";

const el = s => document.querySelector(s);
const esc = (s="") => s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
const stage = el("#stage");
const yearSel = el("#yearSel");
const prevBtn = el("#prevBtn");
const nextBtn = el("#nextBtn");
const progressChip = el("#progressChip");

const state = {
  year: "2024",
  idx: 0,
  data: {questions:[]},
  answers: {},      // ユーザー選択: key -> "true"/"false"
  reveal: false     // 採点表示フラグ
};

/* ---------- 起動 ---------- */
init();
async function init(){
  // URL ?y=2021 指定可
  const u = new URL(location.href);
  const qy = u.searchParams.get("y");
  if (qy && YEARS.includes(qy)) state.year = qy;
  yearSel.value = state.year;

  yearSel.addEventListener("change", async () => {
    state.year = yearSel.value; state.idx=0; state.reveal=false; state.answers={};
    await loadYear(state.year); render();
  });
  prevBtn.addEventListener("click", ()=>{ if(state.idx>0){ state.idx--; state.reveal=false; render(); }});
  nextBtn.addEventListener("click", ()=>{ if(state.idx<state.data.questions.length-1){ state.idx++; state.reveal=false; render(); }});

  await loadYear(state.year);
  render();
}

/* ---------- データ読み込み ---------- */
async function loadYear(year){
  const url = `./${year}.json?v=${DATA_VERSION}`;
  try{
    const res = await fetch(url, {cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // 最低限の正規化
    state.data = {
      year,
      questions: Array.isArray(json.questions) ? json.questions.map((q,i)=>({
        id: q.id || `${year}-${String(i+1).padStart(3,"0")}`,
        type: q.type || "tf-multi",
        stem: q.stem || "",
        explain: q.explain || "",
        items: (q.items||[]).map((it, k)=>({
          label: it.label || ["イ","ロ","ハ","ニ","ホ","ヘ","ト"][k] || String(k+1),
          text:  (it.text||"").trim(),
          // ここでは raw を保持（採点時に正規化）
          _truth: (it.hasOwnProperty("isTrue") ? it.isTrue : it.answer)
        }))
      })) : []
    };
  }catch(e){
    console.error(e);
    state.data = {year, questions:[]};
  }
}

/* ---------- 真偽の正規化 ---------- */
function normTruth(v){
  // あり得る表記をすべて true/false に寄せる
  if (typeof v === "boolean") return v;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (["true","t","1","o","○","〇","maru","◯"].includes(s)) return true;
  if (["false","f","0","x","×","batsu","✗","✕"].includes(s)) return false;
  // "正" "誤" にも対応
  if (["正","正解","correct"].includes(s)) return true;
  if (["誤","不正解","incorrect"].includes(s)) return false;
  return null;
}

/* ---------- 画面 ---------- */
function render(){
  const qs = state.data.questions;
  progressChip.textContent = `${qs.length? state.idx+1:0}/${qs.length}`;

  if (!qs.length){
    stage.innerHTML = `<div class="card">この年度のデータが見つかりません。</div>`;
    return;
  }

  const q = qs[state.idx];
  if (q.type !== "tf-multi"){
    stage.innerHTML = `<div class="card">
      <div class="text-red-600 font-semibold">この設問は tf-multi ではありません</div>
      <div class="text-sm text-gray-600 mt-1">id: ${esc(q.id)} / type: ${esc(q.type||"")}</div>
    </div>`;
    return;
  }

  // 未定義真偽チェック
  const missing = [];
  q.items.forEach((it, i)=>{ if (normTruth(it._truth) === null) missing.push(it.label || String(i+1)); });

  const warn = missing.length
    ? `<div class="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
         ⚠ この設問は正解フラグ未設定の肢があります：${esc(missing.join("・"))}
       </div>`
    : "";

  const itemsHTML = q.items.map((it, i)=>{
    const key = `q:${q.id}:i:${i}`;
    const picked = state.answers[key];
    const truth  = normTruth(it._truth);
    const show   = state.reveal;

    let cls = "border border-gray-200";
    let badge = "";
    if (show){
      const ok = (picked != null) && (String(picked) === String(truth));
      cls = ok ? "border border-green-500 bg-green-50" : "border border-red-400 bg-red-50";
      badge = ok ? `<span class="text-green-600 font-semibold">◎ 正解</span>`
                 : `<span class="text-red-600 font-semibold">× 不正解</span>
                    ${truth===true ? `<span class="ml-2 text-xs text-green-700">（正：〇）</span>` : truth===false ? `<span class="ml-2 text-xs text-red-700">（正：×）</span>` : `<span class="ml-2 text-xs text-gray-500">（正解未設定）</span>`}`;
    }

    return `
      <div class="rounded p-3 mb-3 ${cls}">
        <div class="mb-1 font-semibold">${esc(it.label||["イ","ロ","ハ","ニ","ホ"][i]||`肢${i+1}`)}．</div>
        <div class="mb-2 whitespace-pre-wrap">${esc(it.text||"")}</div>
        <div class="flex items-center gap-6">
          <label class="inline-flex items-center gap-2">
            <input type="radio" name="${key}" value="true"  ${picked==="true"?'checked':''} ${show?'disabled':''} class="accent-blue-600">〇 正しい
          </label>
          <label class="inline-flex items-center gap-2">
            <input type="radio" name="${key}" value="false" ${picked==="false"?'checked':''} ${show?'disabled':''} class="accent-blue-600">× 誤り
          </label>
          ${show ? `<div class="ml-auto">${badge}</div>` : ""}
        </div>
      </div>`;
  }).join("");

  stage.innerHTML = `
    ${warn}
    <div class="card">
      <div class="muted mb-1">年度 ${esc(state.year)} / ID: ${esc(q.id)}</div>
      <div class="text-lg sm:text-xl font-semibold mb-3">${esc(q.stem||"")}</div>
      ${itemsHTML}
      <div class="flex gap-3 mt-1">
        <button id="markBtn" class="btn">採点</button>
        <button id="expBtn"  class="btn-outline">解説を表示</button>
      </div>
      <details class="mt-3 border rounded p-3 bg-gray-50">
        <summary class="cursor-pointer select-none">解説</summary>
        <div class="mt-2 whitespace-pre-wrap text-sm text-gray-700">${esc(q.explain||"（準備中）")}</div>
      </details>
    </div>
  `;

  // 入力イベント
  q.items.forEach((it, i)=>{
    stage.querySelectorAll(`input[name="q:${q.id}:i:${i}"]`).forEach(r=>{
      r.addEventListener("change", e=>{
        state.answers[`q:${q.id}:i:${i}`] = e.target.value; // "true"/"false"
      });
    });
  });

  stage.querySelector("#markBtn").addEventListener("click", ()=>{
    state.reveal = true;
    render();
  });
  stage.querySelector("#expBtn").addEventListener("click", ()=>{
    const dtl = stage.querySelector("details");
    if (dtl) dtl.open = !dtl.open;
  });

  progressChip.textContent = `${state.idx+1}/${state.data.questions.length}`;
}

/* 既存HTMLに合わせた最低限のクラス（なければ影響なし） */
