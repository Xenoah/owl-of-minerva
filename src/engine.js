// ===== 推論エンジン（ベイズ更新 + 情報利得で次の質問を選ぶ） =====
// 回答 a: +2(はい) +1(たぶん) 0(わからない) -1(たぶん違う) -2(いいえ)
// 列 index = 2 - a
const LK = {
  "2":  [.55,.22,.10,.08,.05],
  "1":  [.32,.30,.16,.13,.09],
  "U":  [.16,.20,.28,.20,.16],   // その思想が特に立場を示していない
  "N":  [.08,.17,.50,.17,.08],   // その思想が意図的に「中立・保留」の立場
  "-1": [.09,.13,.16,.30,.32],
  "-2": [.05,.08,.10,.22,.55]
};

const ENGINE = (function(){
  const TKEYS = new Set(TRAITS.map(t => t[0]));
  const seen = new Set();
  PH.forEach(p => {
    if (seen.has(p.id)) throw new Error("duplicate id " + p.id);
    seen.add(p.id);
    if (!REGIONS[p.r]) throw new Error("bad region " + p.r + " in " + p.id);
    p.t = {};
    p.tr.trim().split(/\s+/).forEach(tok => {
      const m = tok.match(/^([a-z]+)(-?\d)$/);
      if (!m) throw new Error("bad token " + tok + " in " + p.id);
      if (!TKEYS.has(m[1])) throw new Error("unknown trait " + m[1] + " in " + p.id);
      if (m[1] in p.t) throw new Error("dup trait " + m[1] + " in " + p.id);
      const v = +m[2];
      p.t[m[1]] = v === 0 ? "N" : v;
    });
    for (const d of p.dom) if (!DOMAINS[d]) throw new Error("bad domain " + d + " in " + p.id);
    p.macro = REGIONS[p.r].macro;
  });

  // ---- 「当てる」モード専用のメタ質問（時代・地域・分野）
  const reg = (pred) => p => p.macro === "world" ? "U" : (pred(p) ? 2 : -2);
  const era = (boundary, after) => p => {
    const d = p.y - boundary;
    if (Math.abs(d) <= 30) return ((d >= 0) === after) ? 1 : -1;
    return ((d > 0) === after) ? 2 : -2;
  };
  const dom = (d) => p => p.dom[0] === d ? 2 : (p.dom.includes(d) ? 1 : (d === "r" ? -2 : -1));
  const thinkerCount = (p) => {
    if (p.th.startsWith("（")) return 9;
    const s = p.th.replace(/（[^）]*）/g, "");
    return s.split("、").filter(x => x.trim()).length;
  };
  const META = [
    ["m_west","ヨーロッパや北米（いわゆる西洋）で生まれた思想？", reg(p => p.macro === "west")],
    ["m_gr","古代ギリシア・ローマの思想？", p => p.r === "gr" ? 2 : -2],
    ["m_eastasia","中国・日本・朝鮮半島など、東アジアで生まれた思想？", reg(p => p.macro === "eastasia")],
    ["m_china","中国で生まれた思想？", reg(p => p.r === "cn")],
    ["m_japan","日本で生まれた思想？", reg(p => p.r === "jp")],
    ["m_india","インドやチベットで生まれた思想？", reg(p => p.macro === "india")],
    ["m_islam","イスラーム圏や中東で生まれた思想？", reg(p => p.macro === "islam")],
    ["m_south","アフリカや中南米で生まれた思想？", reg(p => p.macro === "south")],
    ["m_de","ドイツ語圏で生まれた思想？", reg(p => p.r === "de")],
    ["m_fr","フランス語圏で生まれた思想？", reg(p => p.r === "fr")],
    ["m_en","英語圏（イギリス・アメリカなど）で生まれた思想？", reg(p => ["uk","us","au"].includes(p.r))],
    ["e_bc","紀元前に生まれた思想？", era(0, false)],
    ["e_1500","西暦1500年より前（古代・中世）の思想？", era(1500, false)],
    ["e_1800","1800年以降に生まれた思想？", era(1800, true)],
    ["e_1900","1900年以降に生まれた思想？", era(1900, true)],
    ["e_1960","1960年以降の、比較的新しい思想？", era(1960, true)],
    ["d_s","主に政治や社会のあり方を論じる思想？", dom("s")],
    ["d_l","主に「どう生きるべきか」を説く思想？", dom("l")],
    ["d_p","主に心や意識について論じる思想？", dom("p")],
    ["d_k","主に科学・論理・言語について論じる思想？", dom("k")],
    ["d_r","宗教や信仰と深く結びついた思想？", dom("r")],
    ["d_m","主に世界や存在の成り立ちを論じる思想？", dom("m")],
    ["d_e","主に知識や認識について論じる思想？", dom("e")],
    ["d_a","美や芸術を特に重んじる思想？", p => p.dom.includes("a") ? 2 : (p.t.beau === 2 ? 1 : -1)],
    ["m_one","特定の一人の思想家の名前と強く結びついている？", p => { const c = thinkerCount(p); return c === 1 ? 2 : (c === 2 ? -1 : -2); }]
  ];

  const Q = [];
  TRAITS.forEach(([k, g, text]) => Q.push({ key: k, kind: "belief", group: g, text }));
  META.forEach(([k, text, fn]) => Q.push({ key: k, kind: "meta", group: "手がかり", text, fn }));

  const N = PH.length;
  const VAL = Q.map(q => PH.map(p => {
    if (q.kind === "belief") return (q.key in p.t) ? String(p.t[q.key]) : "U";
    return String(q.fn(p));
  }));
  const ROWS = VAL.map(col => col.map(v => LK[v]));
  const LOGROWS = ROWS.map(col => col.map(r => r.map(Math.log)));
  // 各質問・各回答の平均対数尤度（「決め手」の算出用）
  const AVGLOG = LOGROWS.map(col => [0,1,2,3,4].map(c => col.reduce((s, r) => s + r[c], 0) / N));

  const beliefQs = Q.map((q, i) => i).filter(i => Q[i].kind === "belief");
  const allQs = Q.map((q, i) => i);

  function newGame(mode) {
    return { mode, asked: [], logp: new Float64Array(N), excluded: new Set(), wrong: [] };
  }
  function applyAnswer(g, qi, a) {
    g.asked.push({ qi, a });
    if (g.mode === "guess" && a === 0) return;
    const c = 2 - a, lr = LOGROWS[qi];
    for (let p = 0; p < N; p++) g.logp[p] += lr[p][c];
  }
  function rebuild(mode, asked, excluded) {
    const g = newGame(mode);
    asked.forEach(x => applyAnswer(g, x.qi, x.a));
    excluded.forEach(e => g.excluded.add(e));
    return g;
  }
  function posterior(g) {
    let mx = -Infinity;
    for (let p = 0; p < N; p++) if (!g.excluded.has(p) && g.logp[p] > mx) mx = g.logp[p];
    const P = new Float64Array(N); let s = 0;
    for (let p = 0; p < N; p++) { if (g.excluded.has(p)) continue; P[p] = Math.exp(g.logp[p] - mx); s += P[p]; }
    for (let p = 0; p < N; p++) P[p] /= s;
    return P;
  }
  function ranking(g) {
    const P = posterior(g);
    return Array.from({ length: N }, (_, i) => i).filter(i => !g.excluded.has(i)).sort((a, b) => P[b] - P[a]).map(i => ({ i, p: P[i] }));
  }
  function questionGains(g) {
    const P = posterior(g);
    const idx = [];
    for (let p = 0; p < N; p++) if (P[p] > 1e-6) idx.push(p);
    const LP = new Float64Array(N);
    let H0 = 0;
    for (const p of idx) { LP[p] = Math.log(P[p]); H0 -= P[p] * LP[p]; }
    const askedSet = new Set(g.asked.map(x => x.qi));
    const pool = g.mode === "guess" ? allQs : beliefQs;
    const out = [];
    for (const qi of pool) {
      if (askedSet.has(qi)) continue;
      const rows = ROWS[qi], lrows = LOGROWS[qi];
      let EH = 0;
      for (let c = 0; c < 5; c++) {
        let s = 0, sl = 0;
        for (const p of idx) { const w = P[p] * rows[p][c]; s += w; sl += w * (LP[p] + lrows[p][c]); }
        if (s <= 0) continue;
        if (g.mode === "guess" && c === 2) { EH += s * H0; continue; }
        EH += s * (-sl / s + Math.log(s));
      }
      out.push({ qi, gain: H0 - EH });
    }
    out.sort((a, b) => b.gain - a.gain);
    return out;
  }
  function pickQuestion(g, rng) {
    rng = rng || Math.random;
    const gains = questionGains(g);
    if (!gains.length) return null;
    const best = gains[0].gain;
    let cands;
    if (g.asked.length < 2) cands = gains.slice(0, 6);
    else cands = gains.filter(x => x.gain >= best * 0.92).slice(0, 3);
    const pick = cands[Math.floor(rng() * cands.length)] || gains[0];
    return { qi: pick.qi, gain: pick.gain };
  }
  // 一致度：答えたすべての問いについて「その答えに最もよく合う立場」と比べた尤度比の幾何平均。
  // 事後確率の順位と必ず一致する（事前分布が一様なため）。
  const MAXL = [0,1,2,3,4].map(c => Math.max(...Object.values(LK).map(r => r[c])));
  function closeness(g, pi) {
    let s = 0, n = 0;
    for (const { qi, a } of g.asked) {
      if (g.mode === "guess" && a === 0) continue;
      const c = 2 - a;
      s += LOGROWS[qi][pi][c] - Math.log(MAXL[c]); n++;
    }
    if (!n) return 0;
    return Math.round(Math.sqrt(Math.exp(s / n)) * 100);
  }
  function agreement(g, pi) {
    let s = 0, n = 0;
    for (const { qi, a } of g.asked) {
      const v = VAL[qi][pi];
      if (v === "U") continue;
      if (g.mode === "guess" && a === 0) continue;
      const vv = v === "N" ? 0 : +v;
      s += 1 - Math.abs(a - vv) / 4; n++;
    }
    return n ? { pct: Math.round(s / n * 100), n } : { pct: null, n: 0 };
  }
  function reasons(g, pi, k) {
    const out = [];
    for (const { qi, a } of g.asked) {
      if (g.mode === "guess" && a === 0) continue;
      if (VAL[qi][pi] === "U") continue;
      const c = 2 - a;
      const score = LOGROWS[qi][pi][c] - AVGLOG[qi][c];
      if (score > 0.25) out.push({ qi, a, score });
    }
    out.sort((x, y) => y.score - x.score);
    return out.slice(0, k || 4);
  }
  // 図鑑：立場ベクトルの類似度
  const VEC = PH.map(p => TRAITS.map(([k]) => { const v = p.t[k]; return (v === undefined || v === "N") ? 0 : v; }));
  function similar(pi, k) {
    const a = VEC[pi];
    const na = Math.hypot(...a) || 1;
    return PH.map((_, j) => {
      if (j === pi) return { j, s: -2 };
      const b = VEC[j]; let d = 0;
      for (let t = 0; t < a.length; t++) d += a[t] * b[t];
      return { j, s: d / (na * (Math.hypot(...b) || 1)) };
    }).sort((x, y) => y.s - x.s).slice(0, k || 4);
  }
  return { Q, VAL, N, newGame, applyAnswer, rebuild, posterior, ranking, questionGains, pickQuestion, agreement, closeness, reasons, similar };
})();
