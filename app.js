/* ========= 設定 ========= */
const YEARS = [2020, 2021, 2022, 2023, 2024];
const FILE_OF = y => `./${y}.json`;

/* ========= ユーティリティ ========= */
const $ = sel => document.querySelector(sel);
const el = (tag, props={}) => Object.assign(document.createElement(tag), props);
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0; [a[i],a[j]]=[a[j],a[i]];} return a; }
function saveLS(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function loadLS(k,d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } }

/* ========= 状態 ========= */
let ALL = {};   // {year: [items...] }
let view = { year: YEARS.at(-1), idx:0, order:[], wrongOnly:false };
let stats = loadLS('stats', {}); // {year:{done:[], wrong:[]}}

/* ========= データロード ========= */
async function ensureYear(y){
  if(ALL[y]) return;
  const res = await fetch(FILE_OF(y));
  const data = await res.json();
  ALL[y] = normalizeData(data);
  if(!stats[y]) stats[y] = {done:[], wrong:[]};
  if(!view.order.length || view.year===y) view.order = [...Array(ALL[y].length).keys()];
}

function normalizeData(data){
  // 柔軟に吸収: items配列 or 配列本体
  const src = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
  const out = [];
  for(const it of src){
    // 既に正式スキーマ（type, bullets 等）ならそのまま
    if(it && (it.type || it.bullets || it.answers)){
      // bullets が空なら stem/other から抽出を試みる
      if(!it.bullets || it.bullets.length===0){
        const text = firstText(it);
        const cooked = cookFromRaw(text);
        it.type    = it.type || cooked.type;
        it.bullets = cooked.bullets;
        it.stem    = it.stem || cooked.stem;
      }
      out.push(it);
      continue;
    }
    // rawデータ（PDFテキスト等）
    const text = firstText(it);
    out.push( cookFromRaw(text) );
  }
  return out;
}

// そのオブジェクトの「本文らしき文字列」を拾う
function firstText(it){
  if(typeof it === 'string') return it;
  const keys = ['raw','text','body','content','full','stem','question','q'];
  for(const k of keys){
    if(typeof it?.[k] === 'string' && it[k].trim()) return it[k];
  }
  return '';
}

/* ========= Raw→標準化 ========= */
const MARKS = [
  // よく出るマーカー群（順に試す）
  'イ','ロ','ハ','ニ','ホ','ヘ','ト','チ','リ',
  'ア','ウ','エ','オ','カ','キ','ク','ケ','コ'
];

function cookFromRaw(raw){
  let text = (raw||'').replace(/\r/g,'').trim();
  // ヘッダ（問題文っぽい先頭行）と肢の分離
  // マーカーの直前位置を拾う。例: 「イ.」「イ．」「イ、」「イ)」「イ 」など
  const ptn = new RegExp(`([${MARKS.join('')}])[\\.．、\\)\\s]\\s*`,'g');
  const hits = [];
  let m; while((m = ptn.exec(text))){ hits.push({i:m.index, mark:m[1]}); }

  let stemPart = text;
  const bullets = [];

  if(hits.length >= 1){
    stemPart = text.slice(0, hits[0].i).trim();
    for(let k=0;k<hits.length;k++){
      const start = hits[k].i;
      const end   = (k+1<hits.length) ? hits[k+1].i : text.length;
      const seg   = text.slice(start, end).trim();
      const cleaned = seg.replace(/^([^\s]+)[\\.．、\)\s]*/,'').trim();
      const mark = hits[k].mark;
      if(cleaned) bullets.push(`${mark}. ${cleaned}`);
    }
  }

  // 出題タイプ推定（個数系のフレーズ）
  const askCount =
    /いくつあるか|いくつか|何個あるか|いくつが正しい|正しいものはいくつ|誤っているものはいくつ/.test(text);
  const askWrong = /誤っている|誤りが/.test(text);
  const askRight = /正しいもの/.test(text) && !askWrong;

  // bullets が取れたら A or COUNT、取れなければ YN（単一文○×）
  if(bullets.length >= 2){
    if(askCount){
      return {
        type:'COUNT',
        stem: stemPart || '次の記述（イ〜）について、該当する個数を選んでください。',
        bullets,
        polarity: askWrong ? 'wrong' : 'right',
        explain: text.slice(0, 2000)
      };
    }else{
      return {
        type:'A',
        stem: stemPart || '次の各記述（イ〜）の正誤を判定してください。',
        bullets,
        answers: new Array(bullets.length).fill(null),
        explain: text.slice(0, 2000)
      };
    }
  }else{
    // どうしても抽出できない ⇒ 単一の○×
    return {
      type:'YN',
      stem: text || '次の記述の正誤を判定してください。',
      bullets: ['文'],
      explain: text.slice(0, 2000)
    };
  }
}

/* ========= 描画 ========= */
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
  $('#stem').textContent  = q.stem || '問題文';
  calcProgress();

  // bullets 表示
  const b = $('#bullets'); b.innerHTML = '';
  if((q.bullets||[]).length){
    for(const t of q.bullets){
      const chip = el('span', {textContent: (t.match(/^(.+?)\./)?.[1] || '') + '.'});
      chip.className='pill'; chip.style.marginRight='8px';
      const body = el('div', {textContent: t.replace(/^[^\.]+[\.．、\)\s]*/,'')});
      const row  = el('div'); row.append(chip, body); row.style.margin='6px 0';
      b.append(row);
    }
  }

  // UI領域初期化
  $('#uiA').classList.add('hidden');
  $('#uiCount').classList.add('hidden');
  $('#feedback').textContent='';
  $('#feedback').className='meta';
  $('#explain').classList.add('hidden');
  $('#explain').textContent = q.explain || '';

  if(q.type==='A'){ renderTypeA(q); }
  else if(q.type==='COUNT'){ renderTypeCount(q); }
  else if(q.type==='YN'){ renderTypeYN(q); }
}

function renderTypeA(q){
  const host = $('#uiA'); host.innerHTML=''; host.classList.remove('hidden');
  (q.bullets||[]).forEach((_,i)=>{
    const row = el('div',{className:'choice'});
    row.append(
      el('label',{innerHTML:`<input type="radio" name="a_${i}" value="1"> ○ 正しい`}),
      el('label',{innerHTML:`<input type="radio" name="a_${i}" value="0"> × 誤り`}),
    );
    host.append(row);
  });
  $('#btnShowAns').onclick = ()=>{
    const got = [];
    for(let i=0;i<(q.bullets||[]).length;i++){
      const v = host.querySelector(`input[name="a_${i}"]:checked`);
      got.push(v ? (v.value==='1') : null);
    }
    if(Array.isArray(q.answers) && q.answers.every(v=>typeof v==='boolean')){
      let ok = true;
      for(let i=0;i<q.answers.length;i++){
        if(got[i]!==q.answers[i]) ok=false;
      }
      $('#feedback').textContent = ok ? '✔ 正解' : '✖ 不正解';
      $('#feedback').className = ok ? 'meta result-ok' : 'meta result-ng';
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
  for(let k=0;k<=Math.max(4,(q.bullets||[]).length);k++){
    row.append(el('label',{innerHTML:`<input type="radio" name="cnt" value="${k}"> ${k}`}));
  }
  host.append(row);
  $('#btnShowAns').onclick = ()=>{
    $('#feedback').textContent = '個数問題：各肢の自己判断で学習してください（模範個数は後で登録します）';
    $('#explain').classList.remove('hidden');
  };
}

function renderTypeYN(q){
  const host = $('#uiA'); host.innerHTML=''; host.classList.remove('hidden');
  const row = el('div',{className:'choice'});
  row.append(
    el('label',{innerHTML:`<input type="radio" name="yn" value="1"> ○ 正しい`}),
    el('label',{innerHTML:`<input type="radio" name="yn" value="0"> × 誤り`}),
  );
  host.append(row);
  $('#btnShowAns').onclick = ()=>{
    $('#feedback').textContent = '単一文の○×（模範解答は後で登録）';
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

/* ========= ナビ ========= */
$('#btnPrev').onclick = ()=>{ view.idx=Math.max(0, view.idx-1); show(view.idx); };
$('#btnNext').onclick = ()=>{ view.idx=Math.min(view.order.length-1, view.idx+1); show(view.idx); };
$('#btnShuffle').onclick = ()=>{ shuffle(view.order); view.idx=0; show(0); };
$('#btnWrong').onclick = ()=>{
  view.wrongOnly = !view.wrongOnly;
  makeOrder(); view.idx=0;
  $('#hint').textContent = view.wrongOnly ? '弱点だけ表示中' : '';
  show(0);
};
$('#btnShowAns').onclick = ()=>{}; // 各UIで上書き
$('#yearSel').onchange = async e=>{
  view.year = +e.target.value;
  await ensureYear(view.year);
  makeOrder(); view.idx=0; renderYearOptions(); show(0);
};

/* ========= 起動 ========= */
(async function init(){
  renderYearOptions();
  await ensureYear(view.year);
  makeOrder(); show(0);
})();
