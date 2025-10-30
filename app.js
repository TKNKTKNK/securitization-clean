/* =========================================================
   証券化マスター：生テキストでも自動分割して表示する強化版
   - 正式フォーマット/暫定（生テキスト）どちらもOK
   - 採点キーが無い場合は「未連携」表示で学習は進められる
   ========================================================= */

const e = React.createElement;
const { useEffect, useMemo, useState, useRef } = React;

const YEARS = [2024, 2023, 2022, 2021, 2020];

/* ---------------- ユーティリティ ---------------- */

const zenkakuDot = "[．・。\\.]"; // 全角/中点/句点
const letterMarks = "(?:ア|イ|ウ|エ|オ|カ|キ|ク|ケ|コ|サ|シ|ス|セ|ソ|タ|チ|ツ|テ|ト)";
const kanjiMarks  = "(?:一|二|三|四|五|甲|乙|丙|丁)";

const SPLIT_RE = new RegExp(
  `(?:^|\\s)(${letterMarks}|${kanjiMarks})\\s*${zenkakuDot}\\s*` , "g"
);

// ノイズ除去
function cleanNoise(str){
  if(!str) return "";
  let s = String(str)
    .replace(/＜無断複写.*?禁止＞/g, "")
    .replace(/<無断複写.*?禁止>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s;
}

// raw から choices を抽出
function splitChoicesFromRaw(raw){
  const s = cleanNoise(raw);

  const indices = [];
  let m;
  SPLIT_RE.lastIndex = 0;
  while((m = SPLIT_RE.exec(s))){
    indices.push({ idx: m.index + m[0].length, mark:m[1]});
  }
  if(indices.length === 0){
    const alt = s.split(/(?=[①②③④⑤⑥⑦⑧⑨])/).filter(Boolean);
    if(alt.length >= 2){
      return alt.map((t,i)=>({label: "①②③④⑤⑥⑦⑧⑨".charAt(i), text:t.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, "") }));
    }
    return s.split(/(?:(?:\r?\n){2,}|　{2,})/).filter(Boolean).map((t,i)=>({
      label: ["ア","イ","ウ","エ","オ","カ"][i]||`項${i+1}`, text:t.trim()
    }));
  }

  const results = [];
  for(let i=0;i<indices.length;i++){
    const start = indices[i].idx;
    const end = (i<indices.length-1 ? indices[i+1].idx : s.length);
    const label = indices[i].mark;
    const body = s.slice(start, end).replace(/^[\s　]+/, "");
    results.push({ label, text: body });
  }
  return results;
}

function toHtml(t){
  return cleanNoise(t)
    .replace(/\r?\n/g, "<br>")
    .replace(/(\s){2,}/g, "$1");
}

/* ---------------- ローカル状態 ---------------- */

function useLocalState(key, initial){
  const [v, setV] = useState(()=>{
    try{ const s = localStorage.getItem(key); return s? JSON.parse(s) : initial; }
    catch{ return initial; }
  });
  useEffect(()=>{ localStorage.setItem(key, JSON.stringify(v)); }, [key, v]);
  return [v, setV];
}

/* ---------------- アプリ本体 ---------------- */

function App(){
  const [year, setYear] = useLocalState("year", YEARS[0]);
  const [data, setData] = useState([]);
  const [idx, setIdx] = useLocalState("idx:"+year, 0);
  const [log, setLog] = useLocalState("log:"+year, {}); // id -> correct/incorrect
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ setIdx(0); }, [year]);

  useEffect(()=>{
    let alive = true;
    async function run(){
      setLoading(true);
      try{
        const r = await fetch(`./${year}.json?v=${Date.now()}`);
        if(!r.ok) throw new Error("not found");
        const js = await r.json();

        const normalized = js.map((q, i)=>{
          const id = q.id || `${year}-${i+1}`;
          if(q.choices && q.choices.length){
            return {
              id,
              section: q.section || q.sectionCode || "",
              question: cleanNoise(q.question || q.title || ""),
              choices: q.choices.map(c=>({ label: c.label || c.l || "", text: cleanNoise(c.text || c.t || ""), correct: !!c.correct })),
              explain: q.explain || q.explanation || "",
              answerKey: q.answerKey || null
            };
          }
          const raw = q.raw || q.question || q.q || "";
          const head = String(raw).split(/(ア|一|甲)[．・。\.]/)[0] || (q.headline||"");
          const choices = splitChoicesFromRaw(raw);
          return {
            id,
            section: q.section || q.sectionCode || "",
            question: cleanNoise(head || q.title || "次の記述（ア〜）について、正誤を判定せよ。"),
            choices: choices.map(c => ({ label: c.label, text: cleanNoise(c.text), correct: undefined })),
            explain: q.explain || "",
            answerKey: q.answerKey || null
          };
        });

        if(alive) setData(normalized);
      }catch(e){
        console.error(e);
        if(alive) setData([]);
      }finally{
        if(alive) setLoading(false);
      }
    }
    run();
    return ()=>{ alive=false; };
  }, [year]);

  const q = data[idx];

  function next(){ setIdx(i=> Math.min(i+1, Math.max(0, data.length-1))); }
  function prev(){ setIdx(i=> Math.max(0, i-1)); }

  // ---- Toast ----
  const [toast, setToastState] = useState("");
  function showToast(msg, ms=900){
    showToast._t && clearTimeout(showToast._t);
    setToastState(msg);
    showToast._t = setTimeout(()=> setToastState(""), ms);
  }

  function judge(choiceIndex){
    if(!q) return;
    let isCorrect = false;

    if(Array.isArray(q.choices) && typeof q.choices[choiceIndex]?.correct === "boolean"){
      isCorrect = !!q.choices[choiceIndex].correct;
    } else if(q.answerKey && q.choices[choiceIndex]){
      const lab = q.choices[choiceIndex].label;
      if(lab && lab in q.answerKey) isCorrect = !!q.answerKey[lab];
      else isCorrect = false;
    } else {
      setLog(prev => ({ ...prev, [q.id]: null }));
      showToast("この問題は採点キー未連携です（表示は整形済み）", 1800);
      next();
      return;
    }

    setLog(prev => ({ ...prev, [q.id]: isCorrect }));
    showToast(isCorrect ? "⭕ 正解！" : "❌ 不正解", 700);
    setTimeout(next, 250);
  }

  const progress = useMemo(()=>{
    const total = data.length || 0;
    const done = Object.keys(log).length;
    const rate = total ? Math.round(done/total*100) : 0;
    return { total, done, rate };
  }, [data, log]);

  return e("div", {className:"space-y-4"},
    e("div", {className:"flex items-center justify-between gap-3"},
      e("div", {className:"flex items-center gap-2"},
        e("span", {className:"text-2xl font-bold"}, "証券化マスター "),
        e("span", {className:"badge"}, "A型／raw 自動分割 対応版")
      ),
      e("div", {className:"flex items-center gap-2"},
        e("select", {
          className:"border rounded-lg px-3 py-2",
          value: year,
          onChange: ev => setYear(Number(ev.target.value))
        }, YEARS.map(y => e("option", {key:y, value:y}, y))),
        e("span", {className:"text-sm text-gray-500"}, progress.total ? `進捗 ${progress.done}/${progress.total}（${progress.rate}%）` : "ロード中…")
      )
    ),

    // 本文
    loading ? e("div", {className:"p-4 text-gray-600"}, "読み込み中…")
    : !q ? e("div", {className:"p-4 text-gray-600"}, "問題がありません")
    : e("div", {className:"space-y-3"},
        e("div", {className:"qbox"},
          e("div", {className:"text-sm text-gray-500 mb-2"}, q.section || `${year}`),
          e("h2", {className:"text-[17px] sm:text-lg font-semibold mb-2 leading-7"},
            e("span", {className:"mr-2"}, `${idx+1} / ${data.length}`),
            e("span", null, q.question)
          ),
          e("div", {className:"prose text-[16px] sm:text-[17px]"},
            q.choices.map((c, i) =>
              e("button", {
                key:i,
                className:"choice text-left w-full",
                onClick: ()=> judge(i)
              },
                e("div", {className:"font-semibold mb-1"}, `${c.label || ""}`),
                e("div", {dangerouslySetInnerHTML:{__html: toHtml(c.text)}})
              )
            )
          )
        ),
        e("div", {className:"flex justify-between gap-2"},
          e("button", {className:"btn", onClick: prev}, "戻る"),
          e("button", {className:"btn", onClick: next}, "次へ")
        ),
        q.explain ? e("details", {className:"mt-1"},
          e("summary", {className:"cursor-pointer text-sm text-gray-600 select-none"}, "解説をひらく"),
          e("div", {className:"mt-2 p-3 border rounded-lg bg-white prose", dangerouslySetInnerHTML:{__html: toHtml(q.explain)}})
        ) : null
      ),

    toast ? e("div", {className:"fixed bottom-4 inset-x-0 flex justify-center pointer-events-none"},
      e("div", {className:"px-3 py-2 bg-black/80 text-white rounded-lg text-sm"}, toast)
    ) : null
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(e(App));
