// ----- Securitization Clean App (static, no SW) -----

// 小さなstore（localStorage保存）
function useLocalState(key, initial) {
  const [state, setState] = React.useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
}

function Badge({ children }) {
  return React.createElement(
    "span",
    { className: "inline-flex items-center rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-800" },
    children
  );
}

// まず data/2024.json を探し、なければ ルートの 2024.json を試す
async function loadQuestions() {
  const tryPaths = ["./data/2024.json", "./2024.json"];
  for (const p of tryPaths) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) return data;
      }
    } catch {}
  }
  // フォールバック（最低限の動作確認用）
  return [
    {
      id: "SAMPLE-01",
      year: 2024,
      sectionCode: "103",
      section: "103 不動産投資の基礎",
      type: "A",
      stem: "（サンプル）各選択肢に○×を付けてください。",
      choices: [
        { id: "ア", text: "リスク要因の洗い出しは重要。", isTrue: true,  explain: "要点：リスク把握→管理。" },
        { id: "イ", text: "リスクが高いほど必ず期待収益は低下する。", isTrue: false, explain: "“必ず”に注意。一般に要求収益は上がる。" },
        { id: "ウ", text: "予防保全はライフサイクルコストに有利。", isTrue: true,  explain: "修繕=費用だけと見ない。" },
        { id: "エ", text: "真正売買と会計は完全無関係で検討不要。", isTrue: false, explain: "別概念だが整合の検討は必要。" },
      ],
      globalExplain: "サンプル問題です。",
      difficulty: 1,
      keywords: ["基本"]
    }
  ];
}

function App() {
  const [questions, setQuestions] = React.useState(null);
  const [focusSections, setFocusSections] = useLocalState("focus.sections", []);
  const [qIndex, setQIndex] = useLocalState("q.index", 0);
  const [choiceCursor, setChoiceCursor] = React.useState(0);
  const [marks, setMarks] = React.useState({});
  const [showExplain, setShowExplain] = React.useState(false);
  const [lastResult, setLastResult] = React.useState(null);
  const [stats, setStats] = useLocalState("stats.v1", {});

  React.useEffect(() => { loadQuestions().then(setQuestions); }, []);

  if (!questions) {
    return React.createElement("div",
      { className: "min-h-screen flex items-center justify-center text-neutral-500" },
      "読み込み中…"
    );
  }

  const pool = React.useMemo(() => {
    const base = questions;
    return (focusSections?.length ?? 0) > 0 ? base.filter(q => focusSections.includes(q.sectionCode)) : base;
  }, [focusSections, questions]);

  const q = pool[qIndex % pool.length];
  const current = q.choices[choiceCursor];

  const handleMark = (mark) => {
    if (marks[current.id]) return;
    const isCorrect = (mark === "○" && current.isTrue) || (mark === "×" && !current.isTrue);
    setMarks(prev => ({ ...prev, [current.id]: mark }));
    setLastResult({ correct: isCorrect });
    setShowExplain(true);
  };

  const closeExplain = () => {
    setShowExplain(false);
    if (choiceCursor < q.choices.length - 1) {
      setChoiceCursor(choiceCursor + 1);
      return;
    }
    // 最後の選択肢まで終えたら次の問題へ
    const perChoiceAllCorrect = q.choices.every(ch => {
      const mk = marks[ch.id];
      return (mk === "○" && ch.isTrue) || (mk === "×" && !ch.isTrue);
    });
    setStats(prev => {
      const s = { ...(prev || {}) };
      const cur = s[q.sectionCode] || { seen: 0, perfect: 0, wrongChoices: 0 };
      cur.seen += 1;
      if (perChoiceAllCorrect) cur.perfect += 1; else {
        cur.wrongChoices += q.choices.filter(ch => {
          const mk = marks[ch.id];
          return !((mk === "○" && ch.isTrue) || (mk === "×" && !ch.isTrue));
        }).length;
      }
      s[q.sectionCode] = cur;
      return s;
    });
    setMarks({});
    setChoiceCursor(0);
    setQIndex(i => i + 1);
  };

  const sectionList = React.useMemo(() => {
    const codes = Array.from(new Set(questions.map(x => x.sectionCode)));
    return codes.sort();
  }, [questions]);

  const rateFor = (code) => {
    const s = stats[code] || { seen: 0, perfect: 0, wrongChoices: 0 };
    const rate = s.seen ? Math.round((s.perfect / s.seen) * 100) : 0;
    return `${rate}%（${s.perfect}/${s.seen}）`;
  };

  return React.createElement("div", { className: "min-h-screen bg-white text-black" },
    React.createElement("header", { className: "sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur" },
      React.createElement("div", { className: "mx-auto flex max-w-3xl items-center justify-between px-4 py-3" },
        React.createElement("div", { className: "text-sm uppercase tracking-widest text-neutral-500" }, "Securitization Master"),
        React.createElement("div", { className: "flex items-center gap-2" },
          React.createElement("button", {
            className: "rounded-xl border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100",
            onClick: () => { localStorage.clear(); location.reload(); }
          }, "初期化")
        )
      )
    ),
    React.createElement("main", { className: "mx-auto max-w-3xl px-4 py-6" },
      React.createElement("div", { className: "mb-4 flex flex-wrap items-center gap-2" },
        React.createElement("span", { className: "text-xs text-neutral-500" }, "出題分野（タップで絞込）:"),
        ...sectionList.map(code => {
          const active = focusSections.includes(code);
          return React.createElement("button", {
            key: code,
            onClick: () => setFocusSections(prev => active ? prev.filter(x => x !== code) : [...prev, code]),
            className: `rounded-full border px-3 py-1 text-xs ${active ? "border-neutral-600 bg-neutral-800 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`
          }, code);
        }),
        React.createElement("button", { onClick: () => setFocusSections([]), className: "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100" }, "解除"),
      ),
      React.createElement("div", { className: "mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" },
        React.createElement("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          React.createElement("div", { className: "text-xs text-neutral-500" }, "現在の分野"),
          React.createElement("div", { className: "text-xl" }, q.section)
        ),
        React.createElement("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          React.createElement("div", { className: "text-xs text-neutral-500" }, "完全正解率"),
          React.createElement("div", { className: "mt-2 flex flex-wrap gap-2" },
            ...sectionList.map(cd => React.createElement(Badge, { key: cd }, `${cd}: ${rateFor(cd)}`))
          )
        ),
        React.createElement("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          React.createElement("div", { className: "text-xs text-neutral-500" }, "問題進行"),
          React.createElement("div", { className: "text-2xl" }, `${(qIndex % pool.length) + 1} / ${pool.length}`)
        ),
        React.createElement("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          React.createElement("div", { className: "text-xs text-neutral-500" }, "選択肢"),
          React.createElement("div", { className: "text-2xl" }, `${choiceCursor + 1} / ${q.choices.length}`)
        )
      ),
      React.createElement("div", { className: "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" },
        React.createElement("div", { className: "mb-2 text-xs text-neutral-500" }, `${q.year}年度 / ${q.section} / 形式: ${q.type}`),
        React.createElement("h1", { className: "mb-3 text-lg leading-[1.9]" }, q.stem),
        React.createElement("div", { className: "mt-4 rounded-xl border border-neutral-300 p-4" },
          React.createElement("div", { className: "mb-2 flex items-center justify-between text-xs text-neutral-500" },
            React.createElement("span", null, `選択肢 ${choiceCursor + 1} / ${q.choices.length}`)
          ),
          React.createElement("div", { className: "text-base leading-[1.9] mb-3" }, `${current.id}. ${current.text}`),
          React.createElement("div", { className: "mt-2 flex gap-2" },
            React.createElement("button", { className: "w-24 rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40", onClick: () => handleMark("○"), disabled: !!marks[current.id] }, "○ 正しい"),
            React.createElement("button", { className: "w-24 rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40", onClick: () => handleMark("×"), disabled: !!marks[current.id] }, "× 誤り")
          ),
          showExplain && React.createElement("div", { className: "mt-4 rounded-xl border border-neutral-300 bg-white p-4" },
            React.createElement("div", { className: "mb-1 text-xs text-neutral-500" }, "解説"),
            React.createElement("div", { className: "mb-2" },
              current.isTrue ? React.createElement("div", { className: "text-green-600" }, "正解：○（正しい）")
                             : React.createElement("div", { className: "text-red-600" }, "正解：×（誤り）")
            ),
            React.createElement("p", { className: "text-sm leading-relaxed text-black" }, current.explain),
            React.createElement("div", { className: "mt-4 flex justify-end" },
              React.createElement("button", { onClick: () => closeExplain(), className: "rounded-lg border border-neutral-300 px-3 py-1 hover:bg-neutral-100" }, "閉じる（次へ）")
            )
          )
        ),
        q.type === "B" && React.createElement("div", { className: "mt-4 text-xs text-neutral-500" }, "※B型：選択肢の○の数は問題終了時に自動集計されます。")
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));
