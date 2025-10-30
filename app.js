/* =========================================================
   証券化マスター – 最小実装
   - 年度JSONを fetch して配列化
   - q.type === 'tf-multi' を追加サポート
   - A型（単一文 ○×）もサポート
========================================================= */

const YEARS = [2024];      // 他の年を増やす時は [2020,2021,...,2024] のように追加
const state = {
  year: YEARS[YEARS.length - 1],
  data: {},               // {2024: [{...q}, ...]}
  idx: 0                  // 現在の問題index
};

// DOM
const yearSelect = document.getElementById('yearSelect');
const prevBtn    = document.getElementById('prevBtn');
const nextBtn    = document.getElementById('nextBtn');
const qbox       = document.getElementById('qbox');
const counter    = document.getElementById('counter');

// 年度セレクト初期化
function initYearSelect() {
  yearSelect.innerHTML = '';
  YEARS.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  });
  yearSelect.value = state.year;
  yearSelect.onchange = async () => {
    state.year = parseInt(yearSelect.value, 10);
    state.idx = 0;
    await ensureYearLoaded(state.year);
    render();
  };
}

async function ensureYearLoaded(y) {
  if (state.data[y]) return;
  const res = await fetch(`./${y}.json?v=${Date.now()}`);
  if (!res.ok) throw new Error(`${y}.json が読み込めません`);
  const json = await res.json();
  // 互換: json.questions か 直接配列か
  state.data[y] = Array.isArray(json) ? json : (json.questions || []);
}

// ナビ
prevBtn.onclick = () => {
  if (!state.data[state.year]) return;
  state.idx = Math.max(0, state.idx - 1);
  render();
};
nextBtn.onclick = () => {
  const arr = state.data[state.year] || [];
  state.idx = Math.min(arr.length - 1, state.idx + 1);
  render();
};

// ここがポイント：type 判定の先頭で tf-multi を分岐
function renderQuestion(container, q) {
  container.innerHTML = '';
  // 新モード：複数肢 ○×
  if (q.type === 'tf-multi') {
    renderTfMulti(container, q);
    return;
  }
  // 既存A型：単一文○×（q.stem + q.answer:boolean）
  renderTfSingle(container, q);
}

/* ========== 追加: 複数肢○×レンダリング & 採点 ========== */
function renderTfMulti(container, q) {
  // 見出し
  const head = document.createElement('div');
  head.className = 'text-sm text-gray-600 mb-2';
  head.textContent = `年度 ${state.year}`;
  container.appendChild(head);

  // 問題文
  const stem = document.createElement('div');
  stem.className = 'mb-3 text-lg';
  stem.textContent = q.stem || '次の記述（イ〜ニ）について、正誤を判定せよ。';
  container.appendChild(stem);

  // 小肢
  const form = document.createElement('div');
  form.className = 'space-y-3';
  (q.items || []).forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'rounded-lg border px-4 py-3';

    const title = document.createElement('div');
    title.className = 'font-semibold mb-2';
    title.textContent = `${it.label}．${it.text}`;
    row.appendChild(title);

    const radios = document.createElement('div');
    radios.className = 'flex gap-6 items-center';

    const mkRadio = (name, value, labelText) => {
      const lbl = document.createElement('label');
      lbl.className = 'flex items-center gap-2 cursor-pointer';
      const r = document.createElement('input');
      r.type  = 'radio';
      r.name  = name;
      r.value = value; // "true"/"false"
      lbl.appendChild(r);
      const t = document.createElement('span');
      t.textContent = labelText;
      lbl.appendChild(t);
      return lbl;
    };
    const name = `tfm_${idx}`;
    radios.appendChild(mkRadio(name, 'true',  '○ 正しい'));
    radios.appendChild(mkRadio(name, 'false', '× 誤り'));
    row.appendChild(radios);

    // 採点結果
    const res = document.createElement('div');
    res.className = 'mt-2 text-sm';
    res.style.display = 'none';
    row.appendChild(res);

    form.appendChild(row);
  });
  container.appendChild(form);

  // アクション
  const actions = document.createElement('div');
  actions.className = 'mt-4 flex gap-3';
  const gradeBtn = document.createElement('button');
  gradeBtn.className = 'px-4 py-2 rounded bg-blue-600 text-white';
  gradeBtn.textContent = '採点';
  actions.appendChild(gradeBtn);

  const showBtn = document.createElement('button');
  showBtn.className = 'px-4 py-2 rounded bg-gray-200';
  showBtn.textContent = '解説を表示';
  actions.appendChild(showBtn);

  container.appendChild(actions);

  // 採点
  gradeBtn.onclick = () => {
    let allAnswered = true;
    let correct = 0;
    [...form.children].forEach((row, i) => {
      const sel = [...row.querySelectorAll(`input[name="tfm_${i}"]`)].find(r => r.checked);
      const res = row.querySelector('div:last-child');
      res.style.display = 'block';
      if (!sel) {
        allAnswered = false;
        res.textContent = '未回答';
        res.className = 'mt-2 text-sm text-amber-600';
        return;
      }
      const ok = (sel.value === 'true') === !!q.items[i].answer;
      if (ok) {
        correct++;
        res.textContent = '正解';
        res.className = 'mt-2 text-sm text-green-700';
      } else {
        res.textContent = '不正解';
        res.className = 'mt-2 text-sm text-red-700';
      }
    });
    if (!allAnswered) return;
    const sum = document.createElement('div');
    sum.className = 'mt-3 text-sm';
    sum.textContent = `結果：${correct}/${q.items.length} 正解`;
    container.appendChild(sum);
  };

  // 解説
  showBtn.onclick = () => {
    [...form.children].forEach((row, i) => {
      const ex = q.items[i].explain;
      if (!ex) return;
      let box = row.querySelector('.tfm-explain');
      if (!box) {
        box = document.createElement('div');
        box.className = 'tfm-explain mt-2 text-[13px] text-gray-700 whitespace-pre-wrap';
        row.appendChild(box);
      }
      box.innerHTML = `
        <div class="px-3 py-2 bg-gray-50 border rounded">
          <div><b>正解：</b>${q.items[i].answer ? '○ 正しい' : '× 誤り'}</div>
          <div class="mt-1"><b>解説：</b>${ex}</div>
        </div>`;
    });
    if (q.explain) {
      let g = container.querySelector('.tfm-global');
      if (!g) {
        g = document.createElement('div');
        g.className = 'tfm-global mt-4 text-[13px]';
        container.appendChild(g);
      }
      g.innerHTML = `<div class="px-3 py-2 bg-yellow-50 border rounded text-gray-800">${q.explain}</div>`;
    }
  };
}

/* ========== A型（単一文 ○×） ========== */
// 互換データ: { type:'tf', stem:'...', answer:true/false, explain? }
function renderTfSingle(container, q) {
  const stem = document.createElement('div');
  stem.className = 'mb-3 text-lg';
  stem.textContent = q.stem || '次の記述について、正誤を判定せよ。';
  container.appendChild(stem);

  const box = document.createElement('div');
  box.className = 'rounded-lg border px-4 py-3';
  box.innerHTML = `
    <div class="mb-2">${q.text || ''}</div>
    <label class="mr-6"><input type="radio" name="tf" value="true"> ○ 正しい</label>
    <label><input type="radio" name="tf" value="false"> × 誤り</label>
  `;
  container.appendChild(box);

  const actions = document.createElement('div');
  actions.className = 'mt-4 flex gap-3';
  const gradeBtn = document.createElement('button');
  gradeBtn.className = 'px-4 py-2 rounded bg-blue-600 text-white';
  gradeBtn.textContent = '採点';
  actions.appendChild(gradeBtn);

  const showBtn = document.createElement('button');
  showBtn.className = 'px-4 py-2 rounded bg-gray-200';
  showBtn.textContent = '解説を表示';
  actions.appendChild(showBtn);
  container.appendChild(actions);

  const result = document.createElement('div');
  result.className = 'mt-2 text-sm';
  container.appendChild(result);

  gradeBtn.onclick = () => {
    const sel = container.querySelector('input[name="tf"]:checked');
    if (!sel) {
      result.textContent = '未回答';
      result.className = 'mt-2 text-sm text-amber-600';
      return;
    }
    const ok = (sel.value === 'true') === !!q.answer;
    result.textContent = ok ? '正解' : '不正解';
    result.className = 'mt-2 text-sm ' + (ok ? 'text-green-700' : 'text-red-700');
  };

  showBtn.onclick = () => {
    if (!q.explain) return;
    const ex = document.createElement('div');
    ex.className = 'mt-2 text-[13px] px-3 py-2 bg-gray-50 border rounded';
    ex.innerHTML = `<div><b>正解：</b>${q.answer ? '○ 正しい' : '× 誤り'}</div>
                    <div class="mt-1"><b>解説：</b>${q.explain}</div>`;
    container.appendChild(ex);
  };
}

/* ========== 画面再描画 ========== */
function render() {
  const arr = state.data[state.year] || [];
  if (!arr.length) {
    qbox.innerHTML = '<div class="text-red-700">問題がありません</div>';
    counter.textContent = '-/-';
    return;
  }
  state.idx = Math.min(Math.max(state.idx, 0), arr.length - 1);
  counter.textContent = `${state.idx + 1}/${arr.length}`;
  renderQuestion(qbox, arr[state.idx]);
}

/* ========== 起動 ========== */
(async function boot() {
  initYearSelect();
  await ensureYearLoaded(state.year);
  render();
})();
