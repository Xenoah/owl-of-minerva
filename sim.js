// シミュレーションによる検証：各思想になりきって回答し、当てられるかを確かめる
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = ["traits.js","data1.js","data2.js","data3.js","data4.js","engine.js"]
  .map(f => fs.readFileSync(path.join(__dirname, "src", f), "utf8")).join("\n");
const ctx = { console, Math, Float64Array, Set, Array, Object, String, Error };
vm.createContext(ctx);
vm.runInContext(src + "\n;this.E=ENGINE;this.PH=PH;this.TRAITS=TRAITS;", ctx);
const { E, PH } = ctx;
console.log("思想数:", PH.length, " 質問数:", E.Q.length, "(信念", E.Q.filter(q=>q.kind==="belief").length, ")");

// seeded rng
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

function answerFor(pi, qi, rng, noise) {
  const v = E.VAL[qi][pi];
  let a = (v === "U" || v === "N") ? 0 : +v;
  if (noise && rng() < noise) {
    const r = rng();
    if (r < 0.7) a = Math.max(-2, Math.min(2, a + (rng() < 0.5 ? -1 : 1)));
    else a = [2,1,0,-1,-2][Math.floor(rng()*5)];
  }
  return a;
}

function playGuess(pi, rng, noise) {
  const g = E.newGame("guess");
  let sinceGuess = 0, guesses = 0, cap = 20;
  while (g.asked.length < 50) {
    const q = E.pickQuestion(g, rng);
    if (!q) break;
    E.applyAnswer(g, q.qi, answerFor(pi, q.qi, rng, noise));
    sinceGuess++;
    const top = E.ranking(g)[0];
    const need = guesses === 0 ? 6 : 3;
    if ((sinceGuess >= need && top.p >= 0.8) || g.asked.length >= cap) {
      guesses++;
      if (top.i === pi) return { ok: true, q: g.asked.length, guesses };
      g.excluded.add(top.i); sinceGuess = 0; cap = g.asked.length + 8;
      if (guesses >= 4) break;
    }
  }
  return { ok: false, q: g.asked.length, guesses, top: E.ranking(g)[0].i };
}

function playDiag(pi, rng, noise) {
  const g = E.newGame("diag");
  while (true) {
    const q = E.pickQuestion(g, rng);
    if (!q) break;
    E.applyAnswer(g, q.qi, answerFor(pi, q.qi, rng, noise));
    const r = E.ranking(g);
    if ((g.asked.length >= 12 && r[0].p >= 0.75) || g.asked.length >= 30 || q.gain < 1e-3) break;
  }
  const r = E.ranking(g);
  const rank = r.findIndex(x => x.i === pi);
  return { rank, q: g.asked.length, top: r[0].i, p: r[0].p };
}

const mode = process.argv[2] || "all";
const runs = +(process.argv[3] || 3);
const noiseLvl = +(process.argv[4] || 0.15);

if (mode === "all" || mode === "guess") {
  let ok = 0, qs = 0, gs = 0; const fails = [];
  PH.forEach((p, pi) => {
    for (let r = 0; r < runs; r++) {
      const res = playGuess(pi, mulberry(pi * 97 + r), 0);
      if (res.ok) { ok++; qs += res.q; gs += res.guesses; } else fails.push(`${p.name} → ${PH[res.top].name}`);
    }
  });
  console.log(`\n[当てるモード・正確な回答] 成功 ${ok}/${PH.length*runs}  平均質問数 ${(qs/ok).toFixed(1)}  平均推測回数 ${(gs/ok).toFixed(2)}`);
  if (fails.length) console.log("  失敗:", [...new Set(fails)].join(" / "));
  let ok2 = 0;
  PH.forEach((p, pi) => { for (let r = 0; r < runs; r++) if (playGuess(pi, mulberry(pi * 131 + r + 7), noiseLvl).ok) ok2++; });
  console.log(`[当てるモード・ノイズ${noiseLvl*100}%] 成功 ${ok2}/${PH.length*runs} (${(ok2/PH.length/runs*100).toFixed(1)}%)`);
}
if (mode === "all" || mode === "diag") {
  let top1 = 0, top3 = 0, qs = 0; const miss = [];
  PH.forEach((p, pi) => {
    for (let r = 0; r < runs; r++) {
      const res = playDiag(pi, mulberry(pi * 53 + r), 0);
      qs += res.q; if (res.rank === 0) top1++; if (res.rank < 3) top3++;
      else miss.push(`${p.name}(${res.rank+1}位) → ${PH[res.top].name}`);
      if (res.rank !== 0 && r === 0) miss.push(`${p.name}(${res.rank+1}位) → ${PH[res.top].name}`);
    }
  });
  const T = PH.length * runs;
  console.log(`\n[診断モード・正確な回答] 1位 ${top1}/${T} (${(top1/T*100).toFixed(1)}%)  3位以内 ${top3}/${T}  平均質問数 ${(qs/T).toFixed(1)}`);
  if (miss.length) console.log("  外れ:", [...new Set(miss)].join(" / "));
  let n1 = 0, n3 = 0;
  PH.forEach((p, pi) => { for (let r = 0; r < runs; r++) { const res = playDiag(pi, mulberry(pi * 71 + r + 3), noiseLvl); if (res.rank === 0) n1++; if (res.rank < 3) n3++; } });
  console.log(`[診断モード・ノイズ${noiseLvl*100}%] 1位 ${(n1/T*100).toFixed(1)}%  3位以内 ${(n3/T*100).toFixed(1)}%`);
}
if (mode === "pairs") {
  // 信念ベクトルがほぼ同じ組
  const keys = ctx.TRAITS.map(t => t[0]);
  const out = [];
  for (let i = 0; i < PH.length; i++) for (let j = i + 1; j < PH.length; j++) {
    let d = 0;
    for (const k of keys) {
      const a = PH[i].t[k], b = PH[j].t[k];
      const va = a === undefined ? null : (a === "N" ? 0 : a), vb = b === undefined ? null : (b === "N" ? 0 : b);
      if (va === null && vb === null) continue;
      if (va === null || vb === null) d += Math.abs((va ?? 0) - (vb ?? 0)) * 0.6 + 0.4;
      else d += Math.abs(va - vb);
    }
    out.push([d, PH[i].name, PH[j].name]);
  }
  out.sort((a, b) => a[0] - b[0]);
  out.slice(0, 25).forEach(x => console.log(x[0].toFixed(1), x[1], "⇔", x[2]));
}
