// diagnostic app.js — 画面に状態を表示して原因を特定する用
const root = document.getElementById('root');
const log = (msg) => {
  const p = document.createElement('p');
  p.style.cssText = "font-family:ui-sans-serif,system-ui; margin:8px 0;";
  p.textContent = msg;
  document.body.appendChild(p);
};

root.innerHTML = "🟢 Boot OK: app.js を読み込みました。";

(async () => {
  // 1) React/ReactDOM 読込確認
  log("① React/ReactDOM 読込確認中…");
  const hasReact = typeof window.React !== "undefined";
  const hasReactDOM = typeof window.ReactDOM !== "undefined";
  log(`①結果: React=${hasReact} / ReactDOM=${hasReactDOM}`);

  // 2) 2024.json の存在確認
  log("② 2024.json 取得テスト（./data/2024.json → ./2024.json の順）");
  const tryPaths = ["./data/2024.json", "./2024.json"];
  for (const p of tryPaths) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      log(` - ${p}: status ${res.status}`);
      if (res.ok) {
        const text = await res.text();
        log(`   先頭100文字: ${text.slice(0, 100).replace(/\n/g, " ")}`);
        break;
      }
    } catch (e) {
      log(` - ${p}: ERR ${String(e)}`);
    }
  }

  // 3) 画面に最終メッセージ
  log("③ 診断完了：上のログをスクショで見せてください📸");
})();
