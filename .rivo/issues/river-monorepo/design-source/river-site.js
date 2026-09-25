(function () {
  const SUIT = {
    s: 'M12 1.8C9.2 5.3 3 9.6 3 14.2c0 2.7 2.1 4.6 4.5 4.6 1.6 0 2.9-.8 3.6-1.9-.2 2.2-1 3.9-2.6 5.3h7c-1.6-1.4-2.4-3.1-2.6-5.3.7 1.1 2 1.9 3.6 1.9 2.4 0 4.5-1.9 4.5-4.6 0-4.6-6.2-8.9-9-12.4z',
    h: 'M12 21.6C10.3 20 2.5 14.2 2.5 8.4 2.5 5.3 4.8 3 7.6 3c1.9 0 3.5 1 4.4 2.6C12.9 4 14.5 3 16.4 3c2.8 0 5.1 2.3 5.1 5.4 0 5.8-7.8 11.6-9.5 13.2z',
    d: 'M12 1.5l8 10.5-8 10.5-8-10.5z',
    c: 'M12 2.2a4.3 4.3 0 0 1 3.5 6.8 4.3 4.3 0 1 1-2.4 7.6c.2 2.4 1 4.2 2.6 5.9H8.3c1.6-1.7 2.4-3.5 2.6-5.9A4.3 4.3 0 1 1 8.5 9 4.3 4.3 0 0 1 12 2.2z',
  };
  const RED = 'oklch(0.56 0.2 25)';
  const PERSONAS = [
    { id: 'li', zh: '阿狸', en: 'Foxy', tagZh: '激进', tagEn: 'Aggro', ini: '狸', iniEn: 'F', hue: 25, dZh: '爱施压、常诈唬，赢了会嘚瑟。', dEn: 'Applies pressure, bluffs a lot, gloats when she wins.', p: { tight: 0.2, aggr: 0.9, bluff: 0.7, call: 0.3 } },
    { id: 'k', zh: '老K', en: 'Old K', tagZh: '紧凶', tagEn: 'TAG', ini: 'K', iniEn: 'K', hue: 60, dZh: '只玩好牌，一出手就很重。话少。', dEn: 'Only plays good hands, and hits hard when he does. Says little.', p: { tight: 0.8, aggr: 0.7, bluff: 0.15, call: 0.1 } },
    { id: 'bai', zh: '小白', en: 'Newbie', tagZh: '话痨', tagEn: 'Chatty', ini: '白', iniEn: 'N', hue: 140, dZh: '刚学会规则，什么都想跟，话特别多。', dEn: 'Just learned the rules. Wants to call everything. Never stops talking.', p: { tight: 0.1, aggr: 0.2, bluff: 0.1, call: 0.9 } },
    { id: 'prof', zh: '教授', en: 'Prof', tagZh: '数学派', tagEn: 'Math', ini: '教', iniEn: 'P', hue: 200, dZh: '按赔率和范围做决定，说话像在上课。', dEn: 'Decides by odds and ranges. Talks like he’s giving a lecture.', p: { tight: 0.55, aggr: 0.55, bluff: 0.35, call: 0.3 } },
    { id: 'rock', zh: '石头', en: 'Rock', tagZh: '超紧', tagEn: 'Nit', ini: '石', iniEn: 'R', hue: 290, dZh: '一晚上只玩几手，一开口多半是大牌。', dEn: 'Plays a handful of hands all night. If he bets, he has it.', p: { tight: 0.95, aggr: 0.4, bluff: 0.02, call: 0.1 } },
    { id: 'may', zh: '阿May', en: 'May', tagZh: '情绪化', tagEn: 'Tilty', ini: 'M', iniEn: 'M', hue: 340, dZh: '顺风时很凶，输一手就上头。', dEn: 'Fierce when running hot. Lose one pot and she’s on tilt.', p: { tight: 0.4, aggr: 0.6, bluff: 0.4, call: 0.5 } },
    { id: 'cow', zh: '牛仔', en: 'Cowboy', tagZh: '冒险家', tagEn: 'Gambler', ini: '牛', iniEn: 'C', hue: 95, dZh: '爱全下，信运气，喜欢讲故事。', dEn: 'Loves to shove, trusts his luck, tells tall tales.', p: { tight: 0.3, aggr: 0.8, bluff: 0.5, call: 0.6 } },
    { id: 'zen', zh: '禅师', en: 'Zen', tagZh: '慢打', tagEn: 'Trapper', ini: '禅', iniEn: 'Z', hue: 170, dZh: '拿到强牌反而装弱，喜欢过牌加注。', dEn: 'Plays strong hands weak. Lives for the check-raise.', p: { tight: 0.6, aggr: 0.35, bluff: 0.2, call: 0.5 } },
  ];
  const byId = Object.fromEntries(PERSONAS.map(p => [p.id, p]));
  const L = (zh, en) => ({ zh, en });
  const LINES = {
    li: { raise: L(['加点，怕了？', '这把我不装了。'], ['A little more. Scared?', 'Not hiding it this time.']), allin: L(['全下！接不接？'], ['All in. Your move.']), call: L(['跟，看你能演多久。'], ['Call. Let’s see how long you can act.']), fold: L(['这把让你。'], ['Fine, have this one.']), win: L(['就这？', '谢谢各位的筹码～'], ['That’s it?', 'Thanks for the chips~']) },
    k: { raise: L(['加。'], ['Raise.']), allin: L(['全下。'], ['All in.']), call: L(['跟。'], ['Call.']), win: L(['嗯。'], ['Mm.']) },
    bai: { raise: L(['我加注！是这么说的吧？'], ['I raise! That’s how you say it, right?']), call: L(['跟跟跟！万一中了呢', '我也不知道为啥跟'], ['Call! What if I hit?', 'No idea why I’m calling tbh']), fold: L(['啊…还是弃了吧'], ['Uh… I’ll fold I guess']), check: L(['过！过是啥意思来着'], ['Check! Wait, what’s check again']), allin: L(['全下！！我感觉很好！'], ['ALL IN!! I have a good feeling!']), win: L(['我赢了？？我赢了！！'], ['I won?? I WON!!']) },
    prof: { raise: L(['三分之二底池，教科书操作。'], ['Two-thirds pot. Textbook.']), call: L(['赔率 3.2 比 1，数学上必须跟。'], ['Getting 3.2 to 1. Mathematically a call.']), fold: L(['期望值为负，理性弃牌。'], ['Negative EV. Rational fold.']), allin: L(['我算过了。'], ['I’ve run the numbers.']), win: L(['概率不会骗人。'], ['Probability never lies.']) },
    may: { raise: L(['这把我要拿回来！'], ['I’m winning this one back!']), call: L(['跟！我不信你。'], ['Call! I don’t believe you.']), fold: L(['哼，下把再说。'], ['Hmph. Next hand.']), allin: L(['上头了，全下！'], ['I’m tilted. All in!']), win: L(['看到没！看到没！'], ['See that?! SEE THAT?!']) },
    rock: { raise: L(['……加。'], ['…Raise.']), allin: L(['我有。'], ['I have it.']), win: L(['早说了。'], ['Told you.']) },
    cow: { raise: L(['年轻时我在拉斯维加斯也这么加。'], ['Back in Vegas I raised just like this.']), allin: L(['全下！运气站我这边！'], ['All in! Luck rides with me!']), call: L(['跟了，赌一把。'], ['Call. Let’s gamble.']), win: L(['我就说嘛！'], ['Knew it!']) },
    zen: { check: L(['过。'], ['Check.']), raise: L(['心静，加注。'], ['Calm mind. Raise.']), win: L(['一切随缘。'], ['As it should be.']) },
    _: { raise: L(['加注。'], ['Raise.']), call: L(['跟。'], ['Call.']), win: L(['谢了。'], ['Thanks.']) },
  };
  const STREET = { preflop: ['翻牌前', 'Preflop'], flop: ['翻牌', 'Flop'], turn: ['转牌', 'Turn'], river: ['河牌', 'River'], showdown: ['摊牌', 'Showdown'], idle: ['', ''] };
  const HAND_EN = { '高牌': 'High card', '一对': 'One pair', '两对': 'Two pair', '三条': 'Trips', '顺子': 'Straight', '同花': 'Flush', '葫芦': 'Full house', '四条': 'Quads', '同花顺': 'Straight flush' };
  const tr = (s, en) => !en || !s ? s : s.replace('小盲', 'SB').replace('大盲', 'BB').replace('弃牌', 'Fold').replace('过牌', 'Check').replace('跟注', 'Call').replace('加注至', 'Raise to').replace('下注', 'Bet').replace('全下', 'All-in');
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const av = h => `oklch(0.87 0.08 ${h})`;
  const cardV = (c, key) => ({ has: true, empty: false, key: key || c, r: c[0] === 'T' ? '10' : c[0], sp: SUIT[c[1]], color: c[1] === 'h' || c[1] === 'd' ? RED : '#1d1d1f' });
  const kindOf = l => l.startsWith('弃') ? 'fold' : l.startsWith('全下') ? 'allin' : /加注|下注/.test(l) ? 'raise' : l.startsWith('跟') ? 'call' : 'check';
  const CHANCE = { allin: 0.9, raise: 0.45, fold: 0.22, call: 0.2, check: 0.12, win: 0.85 };

  function createSim(ids, onChange, opts) {
    opts = opts || {};
    const P = window.RiverPoker;
    const START = opts.stack || 10000;
    const g = P.newGame({ sb: 50, bb: 100, players: ids.map(id => ({ id, name: id, stack: START })) });
    const sim = { g, bubbles: {}, paused: false, speed: 1, events: [] };
    let t = null, seq = 0;
    const say = (id, kind) => {
      if (Math.random() > CHANCE[kind]) return;
      const set = (LINES[id] && LINES[id][kind]) || LINES._[kind];
      if (!set) return;
      sim.bubbles[id] = { kind, i: Math.random() * set.zh.length | 0, at: Date.now(), key: 'b' + (++seq), set };
    };
    const newHand = () => {
      g.players.forEach(p => { if (p.stack <= 0) p.stack = START; });
      P.startHand(g); sim.bubbles = {};
    };
    function step() {
      if (sim.paused) return;
      const now = Date.now();
      Object.keys(sim.bubbles).forEach(k => { if (now - sim.bubbles[k].at > 2700) delete sim.bubbles[k]; });
      let delay = 1000;
      if (g.done) { newHand(); delay = 900; }
      else if (g.runout || g.toAct === -1) { P.runoutStep(g); delay = 1200; }
      else {
        const i = g.toAct, pl = g.players[i];
        const lbl = P.apply(g, i, P.decide(g, i, byId[pl.id].p));
        const k = kindOf(lbl); say(pl.id, k); delay = k === 'check' ? 650 : 950;
        if (k === 'allin' || (pl.allin && k !== 'fold')) sim.events.push({ type: 'allin', seat: i, key: 'a' + (++seq) });
        else if (k === 'raise') sim.events.push({ type: 'raise', seat: i, key: 'r' + (++seq), label: lbl });
      }
      if (g.done) { (g.winners || []).forEach(w => say(w.id, 'win')); delay = 3400; }
      onChange();
      t = setTimeout(step, delay / sim.speed);
    }
    sim.start = () => { clearTimeout(t); t = setTimeout(step, 500); };
    sim.stop = () => clearTimeout(t);
    sim.setPaused = v => { sim.paused = v; clearTimeout(t); if (!v) sim.start(); onChange(); };
    newHand();
    return sim;
  }

  // view()（旧版随机座位布局）与 viewReal() 结构相同，官网 v2 只用 viewReal，此快照省略 view()

  // 与应用 Seat.tsx 一致：极坐标座位、状态色调、小盲/大盲徽标
  const BLUE = 'oklch(0.6 0.17 255)', GREEN = 'oklch(0.55 0.14 155)';
  const TONE = { muted: ['#55555a', '#fff', '#a1a1a6', 500], blue: [BLUE, '#fff', BLUE, 500], green: ['#fff', GREEN, '#fff', 600], dark: ['#fff', '#48484a', '#8e8e93', 600], red: ['#fff', RED, '#fff', 700] };
  const avReal = h => `oklch(0.91 0.045 ${h})`;
  function viewReal(sim, en) {
    const g = sim.g, P = window.RiverPoker, n = g.players.length;
    const wins = g.done && g.winners ? g.winners : [];
    const HN = h => en ? (HAND_EN[h] || h) : h;
    const seats = g.players.map((p, i) => {
      const per = byId[p.id], b = sim.bubbles[p.id];
      const a = ((90 + (i * 360) / n) * Math.PI) / 180;
      const turn = !g.done && g.toAct === i, w = wins.find(x => x.id === p.id);
      const faces = g.done && g.showdown && !p.folded && p.hole.length === 2;
      let status = tr(p.last, en), tone = 'muted';
      if (p.folded) { status = en ? 'Folded' : '弃牌'; tone = 'dark'; }
      else if (p.allin) { status = (en ? 'All-in ' : '全下 ') + fmt(p.contrib); tone = 'red'; }
      if (turn) { status = en ? 'Thinking…' : '思考中…'; tone = 'blue'; }
      if (w) { status = (en ? 'Won ' : '赢得 ') + fmt(w.amount) + (w.handName ? ' · ' + HN(w.handName) : ''); tone = 'green'; }
      const T = TONE[tone], up = Math.sin(a) > -0.2;
      return {
        i, x: (50 + 40 * Math.cos(a)) + '%', y: (50 + 36 * Math.sin(a)) + '%', z: b ? 6 : 2,
        name: en ? per.en : per.zh, tag: en ? per.tagEn : per.tagZh, ini: en ? per.iniEn : per.ini, av: avReal(per.hue), stackF: fmt(p.stack),
        dim: p.folded && !g.done ? 'opacity:0.55;filter:grayscale(1)' : '', op: p.folded && !g.done ? 0.55 : 1, gray: p.folded && !g.done ? 'grayscale(1)' : 'none',
        border: turn ? `2px solid ${BLUE}` : w ? `2px solid ${GREEN}` : '1px solid #ebebe9',
        shadow: turn ? '0 0 0 5px oklch(0.6 0.17 255 / 0.18), 0 4px 14px rgba(0,0,0,0.12)' : w ? '0 0 0 6px oklch(0.55 0.14 155 / 0.22), 0 4px 14px rgba(0,0,0,0.12)' : '0 4px 14px rgba(0,0,0,0.1)',
        back: p.hole.length === 2 && !faces && !p.folded, face: !!faces, cards: faces ? p.hole.map(c => cardV(c, g.hand + c)) : [],
        hasStatus: !!status, status: status || '', stColor: T[0], stBg: T[1], stDot: T[2], stW: T[3],
        sb: g.sbI === i && !g.done, bb: g.bbI === i && !g.done, dealer: g.dealer === i,
        bubble: b ? b.set[en ? 'en' : 'zh'][b.i] : '', bkey: b ? b.key : '', bubUp: !!b && up, bubDown: !!b && !up,
      };
    });
    const board = [0, 1, 2, 3, 4].map(k => g.board[k] ? cardV(g.board[k], 'h' + g.hand + '-' + k) : { has: false, empty: true, key: 'e' + k });
    const street = STREET[g.street] || ['', ''];
    return { seats, board, handNo: g.hand, street: street[en ? 1 : 0], potF: fmt(g.done ? 0 : P.pot(g)) };
  }

  const seen = new Set();
  function animateNew(root) {
    if (!root) return;
    root.querySelectorAll('[data-anim]').forEach(el => {
      const k = el.getAttribute('data-anim');
      if (!k || seen.has(k)) return;
      seen.add(k);
      if (!el.animate) return;
      const kind = el.getAttribute('data-anim-kind');
      if (kind === 'deal') el.animate([{ opacity: 0, transform: 'translateY(-18px) rotateY(80deg) scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
      else el.animate([{ opacity: 0, transform: 'translateY(6px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' });
    });
    if (seen.size > 600) seen.clear();
  }

  window.RiverSite = { SUIT, RED, PERSONAS, byId, createSim, viewReal, animateNew, cardV, avReal, fmt };
})();
