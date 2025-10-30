// app.js  —  設問レンダラ（tf-multi対応）

// --------------- データ読み込み ---------------
// 年度ファイルを必要に応じて増やしてください
const DATA_FILES = {
  "2024": "./2024.json?v=tfmulti_001",
  "2023": "./2023.json?v=tfmulti_001",
  "2022": "./2022.json?v=tfmulti_001",
  "2021": "./2021.json?v=tfmulti_001",
  "2020": "./2020.json?v=tfmulti_001",
};

// --------------- 状態 ---------------
let state = {
  year: "2024",
  list: [],
  idx: 0,
  answers: {},  // key = qid / iid
  reveal: false
};

// --------------- ユーティリティ ---------------
const $ = (sel) => document.querySelector(sel);
const escape = (s="") => s.replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

// --------------- 初期化 ---------------
init();
async function init(){
  bindUI();
  await loadYear(state.year);
  render();
}

function bindUI(){
  $("#yearSel").addEventListener("change", async e=>{
    state.year = e.target.value;
    state.idx = 0; state.answers = {}; state.reveal = false;
    await loadYear(state.year);
    render();
  });
  $("#prevBtn").addEventListener("click", ()=>{ if(state.idx>0){ state.idx--; state.reveal=false; render(); }});
  $("#nextBtn").addEventListener("click", ()=>{ if(state.idx < state.list.length-1){ state.idx++; state.reveal=false; render(); }});
  $("#gradeBtn").addEventListener("click", ()=>{ state.reveal=true; render(); });
  $("#expBtn").addEventListener("click", ()=>{
    state.reveal = true;
    const exp = $("#qWrap").querySelector(".js-explain");
    if(exp) exp.classList.toggle("hidden");
  });
}

async function loadYear(y){
  const url = DATA_FILES[y];
  const res = await fetch(url);
  if(!res.ok){ alert("データが読み込めません: "+y); return; }
  const data = await res.json();
  state.list = data.questions || [];
}

// --------------- レンダリング ---------------
function render(){
  $("#progress").textContent = `${state.idx+1}/${state.list.length || 0}`;
  const q = state.list[state.idx];
  $("#qWrap").innerHTML = q ? renderQuestion(q) : `<p class="text-gray-500">この年度はまだ問題がありません。</p>`;
  attachHandlers(q);
}

function renderQuestion(q){
  // tf-multi を最優先
  if(q.type === "tf-multi") return renderTfMulti(q);
  if(q.type === "tf")       return renderTF(q);
  if(q.type === "mc")       return renderMC(q);
  // fallback
  return `<div class="text-sm text-gray-500">未対応の設問タイプです: ${escape(q.type||"")}</div>`;
}

// --- A型（1文に対する○×）---
function renderTF(q){
  const key = `q:${q.id}`;
  const picked = state.answers[key];
  const show = state.reveal;
  const isCorrect = show && (picked === String(q.answer));
  return `
    <div class="space-y-4">
      <div class="badge">年度 ${escape(q.year||"")}</div>
      <div class="text-lg font-medium">${escape(q.stem||"")}</div>
      <div class="rounded border p-3 ${show? (isCorrect?'border-green-400 bg-green-50':'border-red-300 bg-red-50'):'border-gray-200'}">
        ${radioTF(key, picked, show ? String(q.answer) : null)}
      </div>
      ${explainBox(q)}
    </div>
  `;
}

// --- 4択（単一選択）---
function renderMC(q){
  const key = `q:${q.id}`;
  const picked = state.answers[key];
  const show = state.reveal;
  const good = show ? q.answer : null;
  return `
    <div class="space-y-4">
      <div class="badge">年度 ${escape(q.year||"")}</div>
      <div class="text-lg font-medium">${escape(q.stem||"")}</div>
      <div class="space-y-2">
        ${q.choices.map((c,i)=>{
          const v = String(i);
          const ok = (good!==null && v===String(good));
          const wrongPicked = (good!==null && v===String(picked) && v!==String(good));
          return `
            <label class="flex items-center gap-3 rounded border p-3
              ${ ok ? 'border-green-500 bg-green-50'
                  : wrongPicked ? 'border-red-400 bg-red-50'
                  : 'border-gray-200'}">
              <input type="radio" name="${key}" value="${v}" ${picked===v?'checked':''}
               ${show?'disabled':''} class="accent-blue-600">
              <span>${escape(c)}</span>
            </label>`;
        }).join("")}
      </div>
      ${explainBox(q)}
    </div>
  `;
}

// --- tf-multi（イ/ロ/ハ/ニ 各肢に○×）---
function renderTfMulti(q){
  // q.items: [{label:'イ', text:'…', answer:true/false}, …]
  return `
    <div class="space-y-4">
      <div class="flex items-center gap-2">
        <span class="badge">年度 ${escape(q.year||"")}</span>
        <span class="pill">各肢 ○× 判定</span>
      </div>

      ${q.stem ? `<div class="font-medium">${escape(q.stem)}</div>` : ""}

      <div class="space-y-3">
        ${q.items.map((it, idx)=>{
          const key = `q:${q.id}:i:${idx}`;
          const picked = state.answers[key];
          const show = state.reveal;
          const ok = show ? String(it.answer) : null;
          // 色付け
          let cls = 'border-gray-200';
          if(show){
            if(picked===String(it.answer)) cls = 'border-green-500 bg-green-50';
            else cls = 'border-red-400 bg-red-50';
          }
          return `
            <div class="rounded border p-3 ${cls}">
              <div class="mb-1 font-semibold">${escape(it.label||['イ','ロ','ハ','ニ','ホ'][idx]||(`肢${idx+1}`))}．</div>
              <div class="mb-2">${escape(it.text||"")}</div>
              <div class="flex items-center gap-6">
                ${radioTF(key, picked, ok)}
              </div>
            </div>`;
        }).join("")}
      </div>

      ${q.choices?.length ? `
        <div class="mt-2 text-sm text-gray-700">
          <div class="font-semibold mb-1">選択肢（個数問題などがある場合）</div>
          <ul class="list-disc pl-6">
            ${q.choices.map((c)=>`<li>${escape(c)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}

      ${explainBox(q)}
    </div>
  `;
}

// ○×ラジオ
function radioTF(name, picked, good){
  const ro = (good!==null);
  const mk = (val, label)=>`
    <label class="inline-flex items-center gap-2 mr-6">
      <input type="radio" name="${name}" value="${val}" ${picked===String(val)?'checked':''}
        ${ro?'disabled':''} class="accent-blue-600">
      <span>${label}</span>
      ${ good!==null && String(val)===String(good) ? `<span class="text-green-600 text-xs">●</span>` : `` }
    </label>`;
  return mk(true, "○ 正しい") + mk(false, "× 誤り");
}

// 解説ボックス
function explainBox(q){
  return `
    <details class="js-explain mt-2 border rounded p-3 bg-gray-50"${state.reveal?' open':''}>
      <summary class="cursor-pointer select-none">解説</summary>
      <div class="mt-2 whitespace-pre-wrap text-sm">${escape(q.explain||"（準備中）")}</div>
    </details>`;
}

// --------------- イベント登録 ---------------
function attachHandlers(q){
  if(!q) return;
  // ラジオを拾って state.answers に保存
  $("#qWrap").querySelectorAll('input[type="radio"]').forEach(el=>{
    el.addEventListener('change', (e)=>{
      const nm = e.target.getAttribute('name');
      const val = e.target.value;
      state.answers[nm] = val;
      // 採点結果を即フィードバックしたい場合はここで render()
    });
  });
}
