/* app.js — tf / tf-multi / mcq + 弱点学習 & 誤答復習 対応版 */

const YEARS = ["2024","2023","2022","2021","2020"];
const DATA_VERSION = "tfmulti-weak-001";
const STATS_KEY = "securitization_stats_v2";

// ARESの分野（大分類）。JSON側で question.domain が未指定なら "未分類" 扱い。
const DOMAIN_LABELS = [
  "制度・法令", "不動産・評価", "金融・証券化", "投資分析・リスク", "会計・税務", "REIT・市場", "実務・DD", "未分類"
];

const state = {
  year: "2024",
  idx: 0,                // 表示中インデックス（フィルタ後の配列に対して）
  full: { questions: [] }, // 読み込んだ年度の全問題
  view: [],              // フィルタ後に出題対象となる問題配列（元の参照を保持）
  mode: "all",           // all | wrong | weak | domain
  focusDomain: "未分類",  // mode:domain のときに使う
  answers: {},           // 一時回答（画面内）
  reveal: false,         // 採点表示フラグ（1問ずつ）
  stats: loadStats()     // { [qid]: { attempts, correct, wrong, last, domain }, meta:{...} }
};

/* ========== ユーティリティ ========== */
const el  = s => document.querySelector(s);
const $id = id => document.getElementById(id);
const esc = (s="") => s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

function loadStats(){
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { meta:{ver:DATA_VERSION}, items:{} }; }
  catch { return { meta:{ver:DATA_VERSION}, items:{} }; }
}
function saveStats(){ localStorage.setItem(STATS_KEY, JSON.stringify(state.stats)); }

function getQId(q){ return q.id || `${state.year}-${state.full.questions.indexOf(q)+1}`; }
function getDomain(q){
  const d = (q.domain || q.section || "").trim();
  if (!d) return "未分類";
  // 既定ラベルに合わなければ未分類。必要ならここでマッピング拡張。
  return DOMAIN_LABELS.includes(d) ? d : "未分類";
}

function updateStat(q, isCorrectAll){
  const qid = getQId(q);
  const domain = getDomain(q);
  const now = Date.now();
  const st = state.stats.items[qid] || { attempts:0, correct:0, wrong:0, last:null, domain };
  st.attempts += 1;
  if (isCorrectAll) st.correct += 1; else st.wrong += 1;
  st.last = now;
  st.domain = domain;
  state.stats.items[qid] = st;
  saveStats();
}

function accuracyOf(stat){
  const a = stat.attempts || 0;
  return a ? stat.correct / a : 0;
}

function computeDomainSummary(){
  const sums = {}; // domain -> {attempts, correct, wrong}
  for (const d of DOMAIN_LABELS) sums[d] = {attempts:0, correct:0, wrong:0};
  for (const [qid, st] of Object.entries(state.stats.items)){
    const d = st.domain || "未分類";
    if (!sums[d]) sums[d] = {attempts:0, correct:0, wrong:0};
    sums[d].attempts += st.attempts||0;
    sums[d].correct  += st.correct||0;
    sums[d].wrong    += st.wrong||0;
  }
  // 追加：現年度の未出題ドメインも0で表示
  for (const q of state.full.questions){
    const d = getDomain(q);
    if (!sums[d]) sums[d] = {attempts:0, correct:0, wrong:0};
  }
  return sums;
}

function markButtons(){
  return `
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <label class="text-sm text-gray-600">モード:</label>
      <select id="modeSel" class="border rounded px-2 py-1 text-sm">
        <option value="all">通常</option>
        <option value="wrong">間違えた問題だけ</option>
        <option value="weak">弱点分野（自動）</option>
        <option value="domain">分野を指定</option>
      </select>
      <select id="domainSel" class="border rounded px-2 py-1 text-sm">
        ${DOMAIN_LABELS.map(d=>`<option>${d}</option>`).join("")}
      </select>
      <button id="resetStats" class="border rounded px-3 py-1 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200">進捗リセット</button>
      <span id="domainHint" class="text-xs text-gray-500 ml-1"></span>
    </div>`;
}

function buildViewByMode(){
  const all = state.full.questions;
  if (!all.length){ state.view=[]; return; }
  if (state.mode === "all"){
    state.view = all.slice();
    return;
  }
  if (state.mode === "wrong"){
    // 一度でも間違えた、または正解率<100%の問題を優先
    const xs = [];
    for (const q of all){
      const st = state.stats.items[getQId(q)];
      if (!st) continue;
      if (st.wrong > 0 && st.correct === 0){ xs.push(q); }
    }
    // 足りなければ正答率<70%を追加
    if (xs.length < 10){
      for (const q of all){
        const st = state.stats.items[getQId(q)];
        if (!st) continue;
        const acc = accuracyOf(st);
        if (acc < 0.7 && !xs.includes(q)) xs.push(q);
      }
    }
    state.view = xs.length ? xs : all.slice(); // 空なら全体
    return;
  }
  if (state.mode === "weak"){
    // ドメイン別の正答率を計算し、試行>=3の中で正答率が低い順に2ドメイン選ぶ
    const sums = computeDomainSummary();
    const arr = Object.entries(sums).map(([d,v])=>{
      const a = v.attempts ? v.correct/v.attempts : 0;
      return {domain:d, attempts:v.attempts, acc:a};
    }).sort((a,b)=> (a.acc - b.acc) || (b.attempts - a.attempts));
    const targets = arr.filter(x=>x.attempts>=3).slice(0,2).map(x=>x.domain);
    const picks = all.filter(q => targets.includes(getDomain(q)));
    state.view = picks.length ? picks : all.slice();
    return;
  }
  if (state.mode === "domain"){
    state.view = all.filter(q => getDomain(q) === state.focusDomain);
    if (!state.view.length) state.view = all.slice();
    return;
  }
}

function setProgressChip(){
  const chip = el("#progressChip");
  chip.textContent = `${Math.min(state.idx+1, state.view.length)}/${state.view.length||0}`;
}

/* ========== 初期化 ========== */
init();
async function init(){
  bindGlobalUI();
  const u = new URL(location.href);
  const qy = u.searchParams.get("y");
  if (qy && YEARS.includes(qy)){ state.year=qy; }
  $id("yearSel").value = state.year;
  await loadYear(state.year);
  render();
}

function bindGlobalUI(){
  $id("yearSel").addEventListener("change", async e=>{
    state.year = e.target.value;
    state.idx = 0; state.answers = {}; state.reveal = false;
    await loadYear(state.year);
    render();
  });
  $id("prevBtn").addEventListener("click", ()=>{ if(state.idx>0){ state.idx--; state.reveal=false; render(); }});
  $id("nextBtn").addEventListener("click", ()=>{ if(state.idx < state.view.length-1){ state.idx++; state.reveal=false; render(); }});
}

async function loadYear(y){
  try{
    const res = await fetch(`./${y}.json?v=${DATA_VERSION}`, {cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // 正規化：domainが無ければ未分類
    state.full = { questions: (data.questions||[]).map(q=>{
      const copy = {...q};
      copy.domain = (q.domain || q.section || "未分類");
      return copy;
    })};
  }catch(e){
    console.error(e);
    state.full = {questions:[]};
  }
  // ビュー構築
  buildViewByMode();
}

/* ========== 画面レンダリング ========== */
function render(){
  setProgressChip();
  const stage = el("#stage");
  const q = state.view[state.idx];

  // ツールバー + ステータス
  const sums = computeDomainSummary();
  const legend = DOMAIN_LABELS.map(d=>{
    const s = sums[d] || {attempts:0, correct:0};
    const a = s.attempts ? Math.round((s.correct/s.attempts)*100) : 0;
    return `<span class="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 bg-gray-50">
      ${esc(d)} <span class="text-gray-500">${a}%</span>
    </span>`;
  }).join(" ");

  stage.innerHTML = `
    ${markButtons()}
    <div class="mb-2 flex flex-wrap gap-2">${legend}</div>
    ${ q ? renderQuestion(q) : `<div class="text-gray-500">この年度のデータがありません。</div>` }
  `;

  // ツールバーの値反映
  $id("modeSel").value = state.mode;
  $id("domainSel").value = state.focusDomain;
  $id("domainSel").style.display = (state.mode==="domain") ? "inline-block" : "none";
  $id("domainHint").textContent = (state.mode==="weak") ? "（試行>=3の低正答率ドメインを自動出題）" : "";

  // イベント
  $id("modeSel").addEventListener("change", e=>{
    state.mode = e.target.value;
    if (state.mode!=="domain") state.focusDomain="未分類";
    buildViewByMode(); state.idx=0; state.reveal=false; render();
  });
  $id("domainSel").addEventListener("change", e=>{
    state.focusDomain = e.target.value; buildViewByMode(); state.idx=0; state.reveal=false; render();
  });
  $id("resetStats").addEventListener("click", ()=>{
    if (!confirm("進捗（正答率・誤答履歴）をリセットします。よろしいですか？")) return;
    state.stats = { meta:{ver:DATA_VERSION}, items:{} };
    saveStats(); buildViewByMode(); state.idx=0; render();
  });

  // 問題内イベント（採点等）
  attachInQuestionHandlers(q);
}

function renderQuestion(q){
  const head = `
    <div class="mb-1 text-sm text-gray-500">
      年度 ${esc(state.year)} / ${esc(getDomain(q))} / ID: ${esc(getQId(q))}
    </div>
    <div class="text-lg sm:text-xl font-semibold mb-3">${esc(q.stem||"")}</div>
  `;
  if (q.type === "tf-multi") return head + renderTfMulti(q);
  if (q.type === "mc")       return head + renderMC(q);
  return head + renderTF(q);
}

function renderTF(q){
  const key = `q:${getQId(q)}`;
  const picked = state.answers[key];
  const show = state.reveal;
  const isCorrect = show && (picked === String(!!q.answer || !!q.isTrue));
  return `
    <div class="rounded border p-4 ${show? (isCorrect?'border-green-400 bg-green-50':'border-red-300 bg-red-50'):'border-gray-200'}">
      <div class="flex gap-6 mb-2">
        <label class="inline-flex items-center gap-2">
          <input type="radio" name="${key}" value="true"  ${picked==="true"?'checked':''} ${show?'disabled':''} class="accent-blue-600">〇 正しい
        </label>
        <label class="inline-flex items-center gap-2">
          <input type="radio" name="${key}" value="false" ${picked==="false"?'checked':''} ${show?'disabled':''} class="accent-blue-600">× 誤り
        </label>
      </div>
      <div class="flex gap-3 mt-2">
        <button class="bg-blue-600 text-white rounded px-3 py-2" data-act="grade">採点</button>
        <button class="bg-gray-100 text-gray-700 rounded px-3 py-2" data-act="explain">解説</button>
      </div>
      ${explainBox(q)}
    </div>`;
}

function renderMC(q){
  const key = `q:${getQId(q)}`;
  const picked = state.answers[key];
  const show = state.reveal;
  const ans = (q.answer != null) ? String(q.answer) : null;

  const list = (q.choices||[]).map((c,i)=>{
    const v = String(i);
    const ok = (show && ans!==null && v===ans);
    const wrongPicked = (show && v===picked && v!==ans);
    return `
      <label class="flex items-center gap-3 rounded border p-3 mb-2
        ${ ok ? 'border-green-500 bg-green-50'
              : wrongPicked ? 'border-red-400 bg-red-50'
              : 'border-gray-200'}">
        <input type="radio" name="${key}" value="${v}" ${picked===v?'checked':''} ${show?'disabled':''} class="accent-blue-600">
        <span>${esc(c)}</span>
      </label>`;
  }).join("");

  return `
    <div class="rounded border p-4">
      ${list}
      <div class="flex gap-3 mt-2">
        <button class="bg-blue-600 text-white rounded px-3 py-2" data-act="grade">採点</button>
        <button class="bg-gray-100 text-gray-700 rounded px-3 py-2" data-act="explain">解説</button>
      </div>
      ${explainBox(q)}
    </div>`;
}

function renderTfMulti(q){
  const items = (q.items||[]).map((it, idx)=>{
    const key = `q:${getQId(q)}:i:${idx}`;
    const picked = state.answers[key];
    const show = state.reveal;
    const okVal = show ? String(!!(it.answer ?? it.isTrue)) : null;

    let cls = 'border-gray-200';
    if (show){
      cls = (picked===okVal) ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50';
    }
    return `
      <div class="rounded border p-3 mb-3 ${cls}">
        <div class="mb-1 font-semibold">${esc(it.label||['イ','ロ','ハ','ニ','ホ'][idx]||`肢${idx+1}`)}．</div>
        <div class="mb-2 whitespace-pre-wrap">${esc(it.text||"")}</div>
        <div class="flex items-center gap-6">
          <label class="inline-flex items-center gap-2">
            <input type="radio" name="${key}" value="true"  ${picked==="true"?'checked':''} ${show?'disabled':''} class="accent-blue-600">〇 正しい
          </label>
          <label class="inline-flex items-center gap-2">
            <input type="radio" name="${key}" value="false" ${picked==="false"?'checked':''} ${show?'disabled':''} class="accent-blue-600">× 誤り
          </label>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="rounded border p-4">
      ${items}
      <div class="flex gap-3 mt-1">
        <button class="bg-blue-600 text-white rounded px-3 py-2" data-act="grade">採点</button>
        <button class="bg-gray-100 text-gray-700 rounded px-3 py-2" data-act="explain">解説</button>
      </div>
      ${explainBox(q)}
    </div>`;
}

function explainBox(q){
  return `
    <details class="mt-3 border rounded p-3 bg-gray-50">
      <summary class="cursor-pointer select-none">解説</summary>
      <div class="mt-2 whitespace-pre-wrap text-sm text-gray-700">${esc(q.explain||"（準備中）")}</div>
    </details>`;
}

/* 画面内イベントの紐付け */
function attachInQuestionHandlers(q){
  if (!q) return;
  const stage = el("#stage");

  // ラジオ選択の保存
  stage.querySelectorAll('input[type="radio"]').forEach(r=>{
    r.addEventListener("change", e=>{
      const nm = e.target.getAttribute('name');
      state.answers[nm] = e.target.value; // "true" or "false"
    });
  });

  // 採点／解説
  stage.querySelectorAll("[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.getAttribute("data-act");
      if (act==="explain"){
        const dtl = stage.querySelector("details");
        if (dtl) dtl.open = !dtl.open;
        return;
      }
      if (act==="grade"){
        // 採点：tf-multiは「全肢一致」で正解
        let okAll = true;
        if (q.type === "tf-multi"){
          (q.items||[]).forEach((it, i)=>{
            const key = `q:${getQId(q)}:i:${i}`;
            const user = state.answers[key];
            const truth = String(!!(it.answer ?? it.isTrue));
            if (user==null || user!==truth) okAll = false;
          });
        } else if (q.type === "mc"){
          const key = `q:${getQId(q)}`;
          const user = state.answers[key];
          okAll = (user!=null && String(user)===String(q.answer));
        } else {
          const key = `q:${getQId(q)}`;
          const user = state.answers[key];
          okAll = (user!=null && user===String(!!(q.answer ?? q.isTrue)));
        }

        state.reveal = true; // 色付け
        updateStat(q, okAll);
        render();            // 再描画で色＆統計反映

        // 間違えた問題だけモードの場合、次へ自動進行
        if (!okAll && state.mode==="wrong"){
          setTimeout(()=>{ if(state.idx < state.view.length-1){ state.idx++; state.reveal=false; render(); }}, 300);
        }
      }
    });
  });
}
