/* =========================================================
 *  設定
 * ======================================================= */
const YEARS = [2024, 2023, 2022, 2021, 2020];
const JSON_URL = (y) => `./${y}.json?v=tfmulti_001`;

/* =========================================================
 *  小物
 * ======================================================= */
const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

/* 判定表示用 */
function Badge({ ok }) {
  return h(
    'span',
    {
      className:
        'inline-block text-xs px-2 py-0.5 rounded ' +
        (ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'),
    },
    ok ? '正しい' : '誤り'
  );
}

/* =========================================================
 *  問題レンダラ：TF（単一の文章に対し〇×）
 * ======================================================= */
function RenderTF({ q, onAnswer, result }) {
  return h(
    'div',
    { className: 'space-y-4' },
    h('p', { className: 'text-lg leading-7 whitespace-pre-wrap' }, q.stem || ''),
    h(
      'div',
      { className: 'border rounded p-3' },
      h(
        'label',
        { className: 'mr-6 cursor-pointer' },
        h('input', {
          type: 'radio',
          name: 'tf',
          className: 'mr-1',
          onChange: () => onAnswer(true),
          checked: result?.user === true,
        }),
        '〇 正しい'
      ),
      h(
        'label',
        { className: 'cursor-pointer' },
        h('input', {
          type: 'radio',
          name: 'tf',
          className: 'mr-1',
          onChange: () => onAnswer(false),
          checked: result?.user === false,
        }),
        '× 誤り'
      )
    ),
    result &&
      h(
        'div',
        { className: 'mt-3 text-sm' },
        h(Badge, { ok: result.correct }),
        h(
          'div',
          { className: 'mt-2 text-gray-700 whitespace-pre-wrap' },
          q.explain || ''
        )
      )
  );
}

/* =========================================================
 *  問題レンダラ：TF-MULTI（イ・ロ・ハ・ニ など各肢に〇×）
 *  データ仕様は後ろの「サンプルJSON」を参照
 * ======================================================= */
function RenderTFMulti({ q, onAnswer, result }) {
  return h(
    'div',
    { className: 'space-y-4' },
    q.stem && h('p', { className: 'text-lg leading-7 whitespace-pre-wrap' }, q.stem),
    h(
      'div',
      { className: 'space-y-3' },
      q.items.map((item, idx) =>
        h(
          'div',
          { key: idx, className: 'border rounded p-3' },
          h(
            'div',
            { className: 'mb-2 font-medium whitespace-pre-wrap' },
            `${item.label}．${item.text}`
          ),
          h(
            'div',
            null,
            h(
              'label',
              { className: 'mr-6 cursor-pointer' },
              h('input', {
                type: 'radio',
                name: `tfm_${idx}`,
                className: 'mr-1',
                onChange: () => onAnswer(idx, true),
                checked: result?.user?.[idx] === true,
              }),
              '〇 正しい'
            ),
            h(
              'label',
              { className: 'cursor-pointer' },
              h('input', {
                type: 'radio',
                name: `tfm_${idx}`,
                className: 'mr-1',
                onChange: () => onAnswer(idx, false),
                checked: result?.user?.[idx] === false,
              }),
              '× 誤り'
            ),
            result &&
              result.user?.[idx] != null &&
              h(
                'div',
                { className: 'mt-2 text-sm' },
                h(Badge, { ok: item.answer === result.user[idx] }),
                item.explain &&
                  h(
                    'div',
                    { className: 'mt-1 text-gray-700 whitespace-pre-wrap' },
                    item.explain
                  )
              )
          )
        )
      )
    ),
    /* 総合問がある場合は下に「いくつ誤りか」などを表示 */
    q.summary &&
      h(
        'div',
        { className: 'mt-2 text-sm text-gray-600 whitespace-pre-wrap' },
        q.summary
      )
  );
}

/* =========================================================
 *  画面本体
 * ======================================================= */
function App() {
  const [year, setYear] = useState(YEARS[0]);
  const [qs, setQs] = useState([]);
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      setIdx(0);
      setResult(null);
      const res = await fetch(JSON_URL(year));
      const data = await res.json();
      setQs(Array.isArray(data) ? data : data.questions || []);
    })();
  }, [year]);

  const q = qs[idx];

  function handleAnswerTF(value) {
    const ok = value === q.answer;
    setResult({ correct: ok, user: value });
  }

  function handleAnswerTFMulti(itemIdx, value) {
    setResult((prev) => {
      const user = prev?.user ? [...prev.user] : Array(q.items.length).fill(null);
      user[itemIdx] = value;

      // すべて回答済なら総合判定
      const done = user.every((v) => v !== null);
      let correct = null;
      if (done) {
        correct = q.items.every((it, i) => it.answer === user[i]);
      }
      return { user, correct };
    });
  }

  function next() {
    setResult(null);
    setIdx((i) => (i + 1 < qs.length ? i + 1 : 0));
  }
  function prev() {
    setResult(null);
    setIdx((i) => (i - 1 >= 0 ? i - 1 : qs.length - 1));
  }

  return h(
    'div',
    { className: 'space-y-4' },
    h('h1', { className: 'text-2xl font-bold' }, '証券化マスター 2020–2024 練習'),
    h(
      'div',
      { className: 'flex items-center gap-3' },
      h('label', null, '年度:'),
      h(
        'select',
        {
          className: 'border rounded px-2 py-1',
          value: year,
          onChange: (e) => setYear(Number(e.target.value)),
        },
        YEARS.map((y) => h('option', { key: y, value: y }, y))
      ),
      h('span', { className: 'text-sm text-gray-500' }, `${idx + 1}/${qs.length}`),
      h(
        'button',
        { className: 'px-3 py-2 border rounded', onClick: prev },
        '戻る'
      ),
      h(
        'button',
        { className: 'px-3 py-2 bg-blue-600 text-white rounded', onClick: next },
        '次へ'
      )
    ),

    h(
      'div',
      { className: 'mt-2 border rounded p-4' },
      !q
        ? h('div', null, '問題を読み込み中…')
        : q.type === 'tf-multi'
        ? h(RenderTFMulti, { q, onAnswer: handleAnswerTFMulti, result })
        : // 既存の正誤1問
          h(RenderTF, { q, onAnswer: handleAnswerTF, result })
    )
  );
}

/* マウント */
ReactDOM.createRoot(document.getElementById('root')).render(h(App));
