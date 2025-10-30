/* ========= 設定 ========= */
const YEARS = [2020, 2021, 2022, 2023, 2024];
const FILE_OF = y => `./${y}.json`;

/* ========= ユーティリティ ========= */
const $ = sel => document.querySelector(sel);
const el = (tag, props={}) => Object.assign(document.createElement(tag), props);

function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} return a; }

function saveLS(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
function loadLS(key,def){ try{ return JSON.parse(localStorage.getItem(key)) ?? def; }catch{ return def; } }

/* ========= データロード ========= */
let ALL = {};   // {year: [items...] }
let view = { year: YEARS.at(-1), idx:0, order:[], wrongOnly:false };
let stats = loadLS('stats', {}); // {year:{done:Set, wrong:Set}}

async function ensureYear(y){
  if(ALL[y]) return;
  const res = await fetch(FILE_OF(y));
  const data = await res.json();
  // 正式スキーマ or raw を吸収
  ALL[y] = normalizeData(data);
  if(!stats[y]) stats[y] = {done:[], wrong:[]};
  if(!view.order.length || view.year===y) {
    view.order = [...Array(ALL[y].length).keys()];
  }
}

function normalizeData(data){
  // 想定スキーマ:
  // { year:2024, items:[ {type:'A', stem, bullets:['イ...','ロ...'], answers:[true,false,...], explain}, ...] }
  // または raw 文字列だけのアイテム: { raw:"イ.... ロ.... ハ.... ニ.... 正しいものはいくつ..." }
  const items = [];
  const rawItems = data.items || data; // 両対応
  for(const it of rawItems){
    if(it.type){ items.push(it); continue; }
    // rawモード
    const cooked = cookFromRaw(it.raw || it.stem || '');
    items.push(cooked);
  }
  return items;
}

/* ========= Raw→A型/個数型の簡易パーサ ========= */
/*  PDF体裁: 冒頭に「イ.／ロ.／ハ.／ニ.」で肢が連続 → 末尾に「正しい(誤っている)ものはいくつあるか」など
    ※厳密自動判定は難しいので、まずは学習に耐える“見せ方の整理”を優先しています
*/
const MARKS = ['イ','ロ','ハ','ニ','ホ','ヘ','ト','チ','リ']; // 念のため拡張
function cookFromRaw(raw){
  let text = (raw||'').replace(/\r/g,'').trim();
  // 肢の切り出し
  const bullets = [];
  let stemPart = text;
  // 「イ.」「ロ.」などで分割（丸囲み数字等のノイズもある想定）
  const pattern = new RegExp(`([${MARKS.join('')}])[\\.．、)]\\s*`,'g'); // イ. / イ． / イ、 / イ)
  const indices = [];
  let m; while((m = pattern.exec(text))){ indices.push({i:m.index, mark:m[1]}); }
  if(indices.length>=2){
    stemPart = text.slice(0, indices[0].i).trim();
    for(let k=0;k<indices.length;k++){
      const start = indices[k].i;
      const end = (k+1<indices.length)? indices[k+1].i : text.length;
      const seg = text.slice(start, end).trim();
      // 先頭の「イ.」を除去
      const cleaned = seg.replace(/^([^\s]+)[\\.．、)]\s*/,'').trim();
      bullets.push(`${indices[k].mark}. ${cleaned}`);
    }
  }

  // 出題タイプ推定
  const s = text;
  const askCount = /いくつあるか|いくつか|何個あるか/.test(s);
  const askWrong = /誤っている|誤り|誤っているもの全て|誤っているものはいくつ/.test(s);
  const askRight = /正しいもの|正しいものはいくつ/.test(s);

  if(askCount){
    return {
      type:'COUNT',
      stem: stemPart || '次の記述（イ〜）について、正誤の個数を選んでください。',
      bullets,
      polarity: askWrong ? 'wrong' : 'right', // “正しいのはいくつ” か “誤っているのはいくつ” か
      explain: (raw || '').slice(0,1600)
    };
  }else{
    // 既定はA型（各肢の○×）
    return {
      type:'A',
      stem: stemPart || '次の各記述（イ〜）の正誤を判定してください。',
      bullets,
      answers: new Array(Math.max(2, bullets.length)).fill(null), // 未設定（後で本答に置換）
      explain: (raw || '').slice(0,1600)
    };
  }
}

/* ========= レンダリング ========= */
function renderYearOptions(){
  const sel = $('#yearSel');
  sel.innerHTML = YEARS.map(y => `<option value="${y}" ${y===view.year?'selected':''}>${y}</option>`).join('');
}
function calcProgress(){
  const len = ALL[view.year]?.length ?? 0;
  $('#progress').textContent = `${view.idx+1}/${len}`;
}
function makeOrder(){
  const N = ALL[view.year].length;
  view.order = [...Array(N).keys()];
  if(view.wrongOnly){
    const wrongIdx = new Set(stats[view.year].wrong);
    view.order = view.order.filter(i => wrongIdx.has(i));
  }
  if(view.order.length===0) view.order=[0];
}

function show(i){
  const items = ALL[view.year]; if(!items || !items.length) return;
  const idx = Math.max(0, Math.min(i, items.length-1));
  view.idx = idx;
  const q = items[ view.order[idx] ?? idx ];

  $('#qmeta').textContent = `年度 ${view.year}`;
  $('#stem').textContent = q.stem || '問題文';
  calcProgress();

  // bullets
  const b = $('#bullets'); b.innerHTML = '';
  if((q.bullets||[]).length){
    for(const t of q.bullets){
      const chip = el('span', {textContent: t.split('.')[0]+'.'});
      chip.style.marginRight='8px';
      chip.className='pill';
      const body = el('div', {textContent: t.replace(/^[^\.]+[\.．、)]\s*/,'')});
      const row = el('div'); row.append(chip, body); row.style.margin='6px 0';
      b.append(row);
    }
  }

  // reset UI
  $('#uiA').classList.add('hidden');
  $('#uiCount').classList.add('hidden');
  $('#feedback').textContent='';
  $('#feedback').className='meta';
  $('#explain').classList.add('hidden');
  $('#explain').textContent = q.explain || '';

  if(q.type==='A'){
    renderTypeA(q);
  }else if(q.type==='COUNT'){
    renderTypeCount(q);
  }else{
    // fallback
    $('#uiA').classList.add('hidden');
    $('#uiCount').classList.add('hidden');
  }
}

function renderTypeA(q){
  const host = $('#uiA'); host.innerHTML=''; host.classList.remove('hidden');
  // 各肢の ○/×
  (q.bullets||[]).forEach((_,i)=>{
    const row = el('div',{className:'choice'});
    const ok = `ok_${i}`, ng = `ng_${i}`;
    row.append(
      el('label',{innerHTML:`<input type="radio" name="a_${i}" value="1" id="${ok}"> ○ 正しい`}),
      el('label',{innerHTML:`<input type="radio" name="a_${i}" value="0" id="${ng}"> × 誤り`}),
    );
    host.append(row);
  });

  $('#btnShowAns').onclick = ()=>{
    // 受験者の選択を読み取り → フィードバック
    const got = [];
    for(let i=0;i<(q.bullets||[]).length;i++){
      const v = host.querySelector(`input[name="a_${i}"]:checked`);
      got.push(v ? (v.value==='1') : null);
    }
    // 答えが入っていれば採点、未設定なら“模範未設定”表示
    if(Array.isArray(q.answers) && q.answers.every(v=>typeof v==='boolean')){
      let ok = true;
      for(let i=0;i<q.answers.length;i++){
        if(got[i]!==q.answers[i]) ok=false;
      }
      $('#feedback').textContent = ok ? '✔ 正解' : '✖ 不正解';
      $('#feedback').className = ok ? 'meta result-ok' : 'meta result-ng';
      // 弱点記録
      const id = view.order[view.idx] ?? view.idx;
      pushDone(view.year,id, !ok);
    }else{
      $('#feedback').textContent = '模範解答が未登録（○×は自己採点）';
    }
    $('#explain').classList.remove('hidden');
  };
}

function renderTypeCount(q){
  const host = $('#uiCount'); host.innerHTML=''; host.classList.remove('hidden');
  const label = (q.polarity==='wrong') ? '誤っている個数' : '正しい個数';
  const row = el('div',{className:'choice'});
  row.append(el('div',{textContent:label,style:'font-weight:600'}));
  for(let k=0;k<=Math.max(4, (q.bullets||[]).length); k++){
    const id=`cnt_${k}`;
    const lab = el('label',{innerHTML:`<input type="radio" name="cnt" value="${k}" id="${id}"> ${k}`});
    row.append(lab);
  }
  host.append(row);

  $('#btnShowAns').onclick = ()=>{
    // この型は模範個数が未設定のことが多いので、まずは全肢○×の自己判断→個数で自己採点を想定
    $('#feedback').textContent = '個数問題：各肢の自己判断で学習してください（模範個数は後で登録します）';
    $('#explain').classList.remove('hidden');
  };
}

/* ========= 進捗 ========= */
function pushDone(year, id, wrong){
  const s = stats[year] || (stats[year] = {done:[], wrong:[]});
  if(!s.done.includes(id)) s.done.push(id);
  if(wrong){
    if(!s.wrong.includes(id)) s.wrong.push(id);
  }else{
    s.wrong = s.wrong.filter(x=>x!==id);
  }
  saveLS('stats', stats);
}

/* ========= ナビゲーション ========= */
$('#btnPrev').onclick = ()=>{ view.idx=Math.max(0, view.idx-1); show(view.idx); };
$('#btnNext').onclick = ()=>{ view.idx=Math.min(view.order.length-1, view.idx+1); show(view.idx); };
$('#btnShuffle').onclick = ()=>{ shuffle(view.order); view.idx=0; show(0); };
$('#btnWrong').onclick = ()=>{
  view.wrongOnly = !view.wrongOnly;
  makeOrder();
  view.idx = 0;
  $('#hint').textContent = view.wrongOnly ? '弱点だけ表示中' : '';
  show(0);
};
$('#btnShowAns').onclick = ()=>{}; // 各UIで上書き

$('#yearSel').onchange = async e=>{
  view.year = +e.target.value;
  await ensureYear(view.year);
  makeOrder();
  view.idx=0;
  renderYearOptions();
  show(0);
};

/* ========= 起動 ========= */
(async function init(){
  renderYearOptions();
  await ensureYear(view.year);
  makeOrder();
  show(0);
})();
