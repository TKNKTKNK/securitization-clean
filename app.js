// ===== Securitization Master (Clean Static) =====
// - React/ReactDOMは index.html のUMDで読み込み済み
// - JSONは ./2024.json を参照（診断で200確認済）
// - 背景=白 / 文字=黒 / 注意=赤 / ボタン=グレー基調
// - 各選択肢を1つずつ表示 → ○×判定 → すぐ解説 → 次へ

// localStorageに保存できる軽量ステート
function useLocalState(key, initial) {
  const [state, setState] = React.useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  React.useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

// ヘルパー（短縮）
const h = (tag, props, ...children) => React.createElement(tag, props, ...children);

// バッジ
function Badge({ children }) {
  return h("span", { className: "inline-flex items-center rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-800" }, children);
}

// 問題データ読込（./2024.json 固定）
async function loadQuestions() {
  const res = await fetch("./2024.json", { cache: "no-store" });
  if (!res.ok) throw new Error("2024.json not found");
  return await res.json();
}

function App() {
  const [questions, setQuestions] = React.useState(null);
  const [loadErr, setLoadErr] = React.useState(null);

  // 進捗・フィルタ
  const [qIndex, setQIndex] = useLocalState("q.index", 0);
  const [choiceCursor, setChoiceCursor] = React.useState(0);
  const [marks, setMarks] = React.useState({});
  const [showExplain, setShowExplain] = React.useState(false);
  const [lastCorrect, setLastCorrect] = React.useState(null);

  const [focusSections, setFocusSections] = useLocalState("focus.sections", []);
  const [stats, setStats] = useLocalState("stats.v1", {});

  React.useEffect(() => {
    loadQuestions()
      .then(setQuestions)
      .catch(e => setLoadErr(e?.message || "読み込みに失敗しました"));
  }, []);

  // ロード中/エラー
  if (!questions && !loadErr) return h("div", { className: "min-h-screen flex items-center justify-center text-neutral-500" }, "読み込み中…");
  if (loadErr) return h("div", { className: "min-h-screen flex items-center justify-center text-red-600" }, `データ読込エラー: ${loadErr}`);

  // 分野フィルタ
  const sectionList = React.useMemo(() => Array.from(new Set(questions.map(q => q.sectionCode))).sort(), [questions]);
  const pool = React.useMemo(() => {
    return (focusSections?.length ?? 0) > 0
      ? questions.filter(q => focusSections.includes(q.sectionCode))
      : questions;
  }, [questions, focusSections]);

  if (pool.length === 0) {
    return h("div", { className: "min-h-screen flex items-center justify-center p-6 text-center" },
      h("div", null,
        "選択した分野に問題がありません。右上の「初期化」または“解除”で全分野に戻してください。"
      )
    );
  }

  const q = pool[qIndex % pool.length];
  const current = q.choices[choiceCursor];

  const rateFor = (code) => {
    const s = stats[code] || { seen: 0, perfect: 0 };
    const rate = s.seen ? Math.round((s.perfect / s.seen) * 100) : 0;
    return `${rate}%（${s.perfect}/${s.seen}）`;
  };

  // 苦手分野（完全正解率<60% or 選択肢誤答が累積4以上）
  const weakCodes = React.useMemo(() => {
    return sectionList.filter(cd => {
      const s = stats[cd];
      if (!s) return false;
      const perfectRate = s.seen ? s.perfect / s.seen : 1;
      return perfectRate < 0.6 || (s.wrongChoices || 0) >= 4;
    });
  }, [stats, sectionList]);

  // ○×判定
  const handleMark = (mark) => {
    if (marks[current.id]) return; // 二度押し防止
    const correct = (mark === "○" && current.isTrue) || (mark === "×" && !current.isTrue);
    setMarks(prev => ({ ...prev, [current.id]: mark }));
    setLastCorrect(correct);
    setShowExplain(true);
  };

  // 解説を閉じて次へ
  const closeExplain = () => {
    setShowExplain(false);

    if (choiceCursor < q.choices.length - 1) {
      setChoiceCursor(choiceCursor + 1);
      return;
    }

    // 1問の全選択肢を終えたら成績集計
    const perChoiceAllCorrect = q.choices.every(ch => {
      const mk = marks[ch.id];
      return (mk === "○" && ch.isTrue) || (mk === "×" && !ch.isTrue);
    });

    setStats(prev => {
      const s = { ...(prev || {}) };
      const cur = s[q.sectionCode] || { seen: 0, perfect: 0, wrongChoices: 0 };
      cur.seen += 1;
      if (perChoiceAllCorrect) {
        cur.perfect += 1;
      } else {
        cur.wrongChoices += q.choices.filter(ch => {
          const mk = marks[ch.id];
          return !((mk === "○" && ch.isTrue) || (mk === "×" && !ch.isTrue));
        }).length;
      }
      s[q.sectionCode] = cur;
      return s;
    });

    // 次の問題へ
    setMarks({});
    setChoiceCursor(0);
    setQIndex(i => i + 1);
  };

  // UI
  return h("div", { className: "min-h-screen bg-white text-black" },

    // ヘッダー
    h("header", { className: "sticky top-0 z-10 border-b border-neutral-200 bg-white/90 backdrop-blur" },
      h("div", { className: "mx-auto flex max-w-3xl items-center justify-between px-4 py-3" },
        h("div", { className: "text-sm uppercase tracking-widest text-neutral-500" }, "Securitization Master"),
        h("div", { className: "flex items-center gap-2" },
          h("button", {
            className: "rounded-xl border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100",
            onClick: () => { localStorage.clear(); location.href = location.pathname + "?fresh=1"; }
          }, "初期化")
        )
      )
    ),

    // 本文
    h("main", { className: "mx-auto max-w-3xl px-4 py-6" },

      // 分野フィルタ
      h("div", { className: "mb-4 flex flex-wrap items-center gap-2" },
        h("span", { className: "text-xs text-neutral-500" }, "出題分野（タップで絞込）:"),
        ...sectionList.map(code => {
          const active = focusSections.includes(code);
          return h("button", {
            key: code,
            onClick: () => setFocusSections(prev => active ? prev.filter(x => x !== code) : [...prev, code]),
            className: `rounded-full border px-3 py-1 text-xs ${active ? "border-neutral-600 bg-neutral-800 text-white" : "border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`
          }, code);
        }),
        h("button", { onClick: () => setFocusSections(weakCodes), className: "ml-2 rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100" }, "苦手だけ"),
        h("button", { onClick: () => setFocusSections([]), className: "rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-700 hover:bg-neutral-100" }, "解除"),
      ),

      // サマリー
      h("div", { className: "mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" },
        h("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          h("div", { className: "text-xs text-neutral-500" }, "現在の分野"),
          h("div", { className: "text-xl" }, q.section)
        ),
        h("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          h("div", { className: "text-xs text-neutral-500" }, "完全正解率"),
          h("div", { className: "mt-2 flex flex-wrap gap-2" },
            ...sectionList.map(cd => h(Badge, { key: cd }, `${cd}: ${rateFor(cd)}`))
          )
        ),
        h("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          h("div", { className: "text-xs text-neutral-500" }, "問題進行"),
          h("div", { className: "text-2xl" }, `${(qIndex % pool.length) + 1} / ${pool.length}`)
        ),
        h("div", { className: "rounded-2xl border border-neutral-200 p-4" },
          h("div", { className: "text-xs text-neutral-500" }, "選択肢"),
          h("div", { className: "text-2xl" }, `${choiceCursor + 1} / ${q.choices.length}`)
        )
      ),

      // 問題カード
      h("div", { className: "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm" },
        h("div", { className: "mb-2 text-xs text-neutral-500" }, `${q.year}年度 / ${q.section} / 形式: ${q.type}`),
        h("h1", { className: "mb-3 text-lg leading-[1.9]" }, q.stem),

        // 現在の選択肢（1つずつ）
        h("div", { className: "mt-4 rounded-xl border border-neutral-300 p-4" },
          h("div", { className: "mb-2 flex items-center justify-between text-xs text-neutral-500" },
            h("span", null, `選択肢 ${choiceCursor + 1} / ${q.choices.length}`)
          ),
          h("div", { className: "text-base leading-[1.9] mb-3" }, `${current.id}. ${current.text}`),

          // ○×ボタン（グレー基調）
          h("div", { className: "mt-2 flex gap-2" },
            h("button", { className: "w-24 rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40", onClick: () => handleMark("○"), disabled: !!marks[current.id] }, "○ 正しい"),
            h("button", { className: "w-24 rounded-xl border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-40", onClick: () => handleMark("×"), disabled: !!marks[current.id] }, "× 誤り"),
          ),

          // 即時解説
          showExplain && h("div", { className: "mt-4 rounded-xl border border-neutral-300 bg-white p-4" },
            h("div", { className: "mb-1 text-xs text-neutral-500" }, "解説"),
            h("div", { className: "mb-2" },
              current.isTrue
                ? h("div", { className: "text-green-600" }, "正解：○（正しい）")
                : h("div", { className: "text-red-600" }, "正解：×（誤り）")
            ),
            // 注意は赤で強調
            h("p", { className: "text-sm leading-relaxed text-black" },
              h("strong", { className: "text-red-600" }, "要点："),
              " ",
              (current.explain || "").replace(/^要点[:：]\s*/, "")
            ),
            h("div", { className: "mt-4 flex justify-end" },
              h("button", { onClick: () => closeExplain(), className: "rounded-lg border border-neutral-300 px-3 py-1 hover:bg-neutral-100" }, "閉じる（次へ）")
            )
          )
        ),
        q.type === "B" && h("div", { className: "mt-4 text-xs text-neutral-500" }, "※B型：選択肢の○の数は問題終了時に自動集計されます。")
      )
    )
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(h(App));
