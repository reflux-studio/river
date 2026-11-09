/* felt.jsx — 牌面、筹码、座位与牌桌舞台
 *
 * 这一层是桌面端的绘制代码原样搬过来的：
 * 牌面尺寸取自 app/src/ui.jsx 的 CARD_KINDS（桌面 56×80 / 自己 60×84 / 对手 44×62 /
 * 复盘小牌 20×28 / 行内 18×25），牌背是 logic.jsx 的 backPattern 45° 交叉斜纹，
 * 筹码是 DENOM + chipBg + chipEdge 那一套 conic 条纹，
 * 座位胶囊、庄家钮、小盲大盲标、状态胶囊全部照 app/src/table.jsx 的 Seat。
 * 唯一新增的是「空位」——桌面端没有这个状态，画法与座位保持同一套语言。
 *
 * 依赖：app/src/tokens.jsx（S / TOKENS）、tokens.jsx、ui.jsx
 */

const RED = 'oklch(0.56 0.2 25)';
const SUIT_PATH = {
  s: 'M12 1.8C9.2 5.3 3 9.6 3 14.2c0 2.7 2.1 4.6 4.5 4.6 1.6 0 2.9-.8 3.6-1.9-.2 2.2-1 3.9-2.6 5.3h7c-1.6-1.4-2.4-3.1-2.6-5.3.7 1.1 2 1.9 3.6 1.9 2.4 0 4.5-1.9 4.5-4.6 0-4.6-6.2-8.9-9-12.4z',
  h: 'M12 21.6C10.3 20 2.5 14.2 2.5 8.4 2.5 5.3 4.8 3 7.6 3c1.9 0 3.5 1 4.4 2.6C12.9 4 14.5 3 16.4 3c2.8 0 5.1 2.3 5.1 5.4 0 5.8-7.8 11.6-9.5 13.2z',
  d: 'M12 1.5l8 10.5-8 10.5-8-10.5z',
  c: 'M12 2.2a4.3 4.3 0 0 1 3.5 6.8 4.3 4.3 0 1 1-2.4 7.6c.2 2.4 1 4.2 2.6 5.9H8.3c1.6-1.7 2.4-3.5 2.6-5.9A4.3 4.3 0 1 1 8.5 9 4.3 4.3 0 0 1 12 2.2z',
};
const BACK = 'oklch(0.5 0.17 25)';
const DENOM = [[5000, 'oklch(0.52 0.14 250)', '#fff'], [1000, 'oklch(0.78 0.14 80)', '#fff'], [500, 'oklch(0.46 0.16 300)', '#fff'], [100, '#26262a', '#fff'], [25, 'oklch(0.55 0.14 150)', '#fff'], [5, 'oklch(0.55 0.2 27)', '#fff'], [1, '#f2efe8', 'oklch(0.5 0.15 250)']];
const chipBg = (c, s) => `radial-gradient(ellipse at center, ${c} 0 38%, ${s} 38% 45%, ${c} 45% 58%, transparent 59%), repeating-conic-gradient(${c} 0deg 30deg, ${s} 30deg 45deg)`;
const chipEdge = c => `color-mix(in oklch, ${c}, black 38%)`;
const backPattern = c => `repeating-linear-gradient(45deg, rgba(255,255,255,0.17) 0 1.5px, transparent 1.5px 5px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.17) 0 1.5px, transparent 1.5px 5px), ${c}`;
const FELT = { felt: 'oklch(0.47 0.1 158)', rail: '#3a2a1f', dark: true };

/* 一叠筹码：按面额拆分，最多四叠，每叠最多八枚。数值与桌面端一致。 */
function stacksOf(amt) {
  let left = Math.max(0, Math.round(amt || 0));
  const out = [];
  for (const [v, c, sc] of DENOM) { const n = Math.floor(left / v); if (!n) continue; left -= n * v; out.push({ c, sc, n }); }
  return out.slice(0, 4).map(x => {
    const k = Math.min(x.n, 8);
    return { h: 13 + (k - 1) * 3.5, chips: Array.from({ length: k }, (_, j) => ({ b: j * 3.5, bg: chipBg(x.c, x.sc), edge: chipEdge(x.c) })) };
  });
}

function ChipStack({ amt, s }) {
  const groups = stacksOf(amt);
  if (!groups.length) return null;
  return (
    <div style={S(`display:flex;gap:${Math.max(1, Math.round(3 * s.k))}px;align-items:flex-end;padding-bottom:${s.q(3)}px;`)}>
      {groups.map((st, i) => (
        <div key={i} style={S(`position:relative;width:${s.q(24)}px;height:${Math.round(st.h * s.k)}px;`)}>
          {st.chips.map((ch, j) => (
            <div key={j} style={S(`position:absolute;left:0;bottom:${Math.round(ch.b * s.k)}px;width:${s.q(24)}px;height:${s.q(13)}px;border-radius:50%;background:${ch.bg};box-shadow:0 ${s.q(2.5)}px 0 ${ch.edge},0 ${s.q(3)}px ${s.q(4)}px rgba(0,0,0,0.3);`)} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* 七种牌面尺寸。除了乘缩放比，数值与桌面端一模一样，不要合并成一套 scale。 */
function cardBox(kind, s) {
  const k = s.k;
  const map = {
    board: { w: 56, h: 80, r: 7, shadow: '0 1px 0 rgba(0,0,0,0.08),0 5px 12px rgba(0,0,0,0.24)', corner: [6, 6, 3], rank: 21, suit: 13, big: [6, 7, 26] },
    hero: { w: 60, h: 84, r: 8, shadow: '0 1px 0 rgba(0,0,0,0.08),0 6px 14px rgba(0,0,0,0.25)', corner: [6, 6, 3], rank: 23, suit: 14, big: [6, 7, 28] },
    opp: { w: 44, h: 62, r: 6, shadow: '0 4px 10px rgba(0,0,0,0.25)', corner: [4, 5, 2], rank: 17, suit: 10, big: [4, 5, 20] },
    mini: { w: 20, h: 28, r: 4, shadow: 'none', border: true, rank: 11, suit: 10 },
    tiny: { w: 18, h: 25, r: 3.5, shadow: 'none', border: true, rank: 10.5, suit: 9 },
  };
  const m = map[kind] || map.board;
  const box = m.border
    ? `display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:${s.q(m.w)}px;height:${s.q(m.h)}px;box-sizing:border-box;background:#fff;border:1px solid #dcdcd8;border-radius:${s.q(m.r)}px;`
    : `position:relative;width:${s.q(m.w)}px;height:${s.q(m.h)}px;box-sizing:border-box;background:#fff;border-radius:${s.q(m.r)}px;box-shadow:${m.shadow};`;
  return {
    box,
    corner: m.corner ? `position:absolute;left:${s.q(m.corner[0])}px;top:${s.q(m.corner[1])}px;display:flex;flex-direction:column;align-items:center;gap:${s.q(m.corner[2])}px;` : '',
    rank: `font-size:${s.q(m.rank)}px;font-weight:700;line-height:1;letter-spacing:-0.06em;`,
    suit: `width:${s.q(m.suit)}px;height:${s.q(m.suit)}px;display:block;`,
    big: m.big ? `position:absolute;right:${s.q(m.big[0])}px;bottom:${s.q(m.big[1])}px;width:${s.q(m.big[2])}px;height:${s.q(m.big[2])}px;` : null,
  };
}

function PCard({ kind = 'board', code, s, rot }) {
  const b = cardBox(kind, s);
  const rank = code[0] === 'T' ? '10' : code[0];
  const suit = code[1];
  const color = suit === 'h' || suit === 'd' ? RED : '#1d1d1f';
  const corner = (
    <>
      <span style={S(b.rank)}>{rank}</span>
      <svg viewBox="0 0 24 24" style={S(b.suit)} aria-hidden="true"><path d={SUIT_PATH[suit]} fill="currentColor" /></svg>
    </>
  );
  return (
    <div style={{ ...S(b.box), color, ...(rot ? { transform: 'rotate(' + rot + ')' } : null) }} role="img" aria-label={rank + ({ s: '黑桃', h: '红桃', d: '方块', c: '梅花' }[suit] || '')}>
      {b.corner ? <div style={S(b.corner)}>{corner}</div> : corner}
      {b.big ? <svg viewBox="0 0 24 24" style={S(b.big)} aria-hidden="true"><path d={SUIT_PATH[suit]} fill="currentColor" /></svg> : null}
    </div>
  );
}

/* 牌背：两张斜叠的卡框，尺寸与角度照搬桌面端的座位背面 */
function CardBacks({ s }) {
  const card = `width:${s.q(34)}px;height:${s.q(48)}px;box-sizing:border-box;background:#fff;border-radius:${s.q(5)}px;padding:${s.q(2.5)}px;box-shadow:0 2px 6px rgba(0,0,0,0.28);`;
  const inner = `width:100%;height:100%;border-radius:${s.q(3)}px;background:${backPattern(BACK)};`;
  return (
    <div style={S('display:flex;')} aria-label="两张背面朝上的牌">
      <div style={S(card + 'transform:rotate(-7deg);')}><div style={S(inner)} /></div>
      <div style={S(card + `transform:rotate(7deg);margin-left:-${s.q(10)}px;`)}><div style={S(inner)} /></div>
    </div>
  );
}

/* ---------------- 座位 ----------------
 *
 * 一套样式，全平台一致：白色胶囊 = 圆形头像 + 右侧两行（名字 / 筹码或状态）。
 * 手机不再另起一套——之前那套「缩成正圆、筹码挂圆下方」在实际尺寸下既挤又难认，
 * 而且和桌面端看起来像两个产品。
 *
 * 每个座位最多两行文字：状态优先于筹码，都在同一行里切换，不往下叠第三块。
 */
const SEAT = { avatar: 32, padY: 6, padX: 14, gap: 8, name: 14, meta: 12 };

/* 环上给一个座位预留的占地：宽度是胶囊，高度还要算上头顶那一排牌，
   否则最上面的座位会被舞台裁掉。 */
const SEAT_FOOT = { w: 150, h: 170 };

function Seat({ p, s, onPick }) {
  if (p.empty) {
    return (
      <div style={S(`position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:6px;z-index:2;`)}>
        <button type="button" className="hole" onClick={() => onPick && onPick(p.seatNo)}
          aria-label={'坐到 ' + (p.seatNo + 1) + ' 号位'}
          style={S('width:48px;height:48px;box-sizing:border-box;padding:0;border-radius:50%;border:1.5px solid rgba(255,255,255,0.92);background:rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,0.32),inset 0 0 0 3px rgba(0,0,0,0.1);')}>
          坐
        </button>
        <span style={S('font-size:11px;color:rgba(255,255,255,0.72);font-variant-numeric:tabular-nums;')}>{p.seatNo + 1}</span>
      </div>
    );
  }

  const cardKind = p.hero ? 'hero' : 'opp';
  const shell = `position:relative;box-sizing:border-box;display:inline-flex;align-items:center;gap:${SEAT.gap}px;`
    + `padding:${SEAT.padY}px ${SEAT.padX}px;border-radius:999px;background:#fff;`
    + `border:${p.border};box-shadow:${p.shadow};opacity:${p.op};filter:${p.filter};transition:border-color 150ms,box-shadow 150ms;`;

  return (
    <div style={S(`position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;z-index:2;white-space:nowrap;`)}>
      {p.cards && p.cards.length ? (
        <div style={S('display:flex;gap:3px;margin-bottom:-8px;position:relative;z-index:1;')}>
          {p.cards.map((c, i) => <PCard key={i} kind={cardKind} code={c} s={s} rot={p.hero && cardKind === 'hero' ? (i ? '4deg' : '-4deg') : null} />)}
        </div>
      ) : null}
      {p.backs ? (
        <div style={S('margin-bottom:-8px;position:relative;z-index:1;')}><CardBacks s={s} /></div>
      ) : null}

      <div style={S(shell)}>
        <Avatar hue={p.hue} size={SEAT.avatar} dim={p.dim}>{p.ini}</Avatar>

        <div style={S('display:flex;flex-direction:column;gap:1px;min-width:0;')}>
          <div style={S('display:flex;align-items:center;gap:6px;min-width:0;')}>
            <span style={S(`font-size:${SEAT.name}px;font-weight:600;line-height:1.2;max-width:96px;overflow:hidden;text-overflow:ellipsis;`)}>{p.name}</span>
            {p.isOwner ? <Tag tone="owner">房主</Tag> : null}
          </div>
          <span style={S(`font-size:${SEAT.meta}px;line-height:1.2;font-variant-numeric:tabular-nums;max-width:120px;overflow:hidden;text-overflow:ellipsis;color:${p.metaColor};`)}>{p.meta}</span>
        </div>

        <span aria-label={'座位 ' + (p.seatNo + 1)}
          style={S('position:absolute;left:-6px;bottom:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#fff;border:1px solid #ebebe9;color:#a1a1a6;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums;')}>
          {p.seatNo + 1}
        </span>

        {p.isDealer ? (
          <span style={S('position:absolute;right:-8px;bottom:-8px;width:18px;height:18px;border-radius:50%;background:#fff;color:#1d1d1f;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1.5px #1d1d1f inset,0 2px 5px rgba(0,0,0,0.3);')}>D</span>
        ) : null}

        {p.blind ? (
          <span style={S(`position:absolute;left:-6px;top:-6px;padding:1px 5px;border-radius:999px;font-size:10px;font-weight:700;box-shadow:0 0 0 2px #fff;background:${p.blind === 'SB' ? 'oklch(0.58 0.15 250)' : 'oklch(0.8 0.15 80)'};color:${p.blind === 'SB' ? '#fff' : '#1d1d1f'};`)}>
            {p.blind === 'SB' ? '小盲' : '大盲'}
          </span>
        ) : null}

        {p.offline ? (
          <span style={S('position:absolute;right:-2px;top:-2px;width:10px;height:10px;border-radius:50%;background:oklch(0.56 0.2 25);box-shadow:0 0 0 2px #fff;')} />
        ) : null}
      </div>
    </div>
  );
}

/* 舞台实测尺寸：容器一变就重算座位环。 */
function useStageBox() {
  const ref = React.useRef(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

/* 牌桌舞台：圆角矩形桌布，座位沿轮廓按弧长均分。
 *
 * 之前是椭圆：长轴两端收得急，人一多，底边三个座位就挤在一起。
 * 换成圆角矩形之后，上下两条直边能均匀排开三到四个座位，间距相等。
 * 环半径按舞台实测尺寸算，并用座位占地兜底，任何窗口下都不出界。
 */
function TableStage({ room, mode, g, s, revealed, onPick, meSeat, status }) {
  const [ref, box] = useStageBox();
  const seatCount = room.seatCount;
  const gameOn = mode === 'game' && !!g;
  const rotateBy = gameOn && meSeat != null && meSeat >= 0 ? meSeat : null;
  const base = rotateBy == null ? 0 : rotateBy;
  const rail = DESK.rail;
  const inset = DESK.feltInset;

  const ring = makeRing(box, SEAT_FOOT);

  /* 桌布圆角：比例固定，永远是圆角矩形，不会退化成胶囊或椭圆 */
  const feltW = Math.max(0, box.w * (1 - (inset.l + inset.r) / 100));
  const feltH = Math.max(0, box.h * (1 - (inset.t + inset.b) / 100));
  const feltR = Math.max(24, Math.round(Math.min(feltW, feltH) * 0.26));

  const bySeat = {};
  if (gameOn) g.players.forEach((p, idx) => { bySeat[p.seatNo] = { p, idx }; });

  const nodes = [];
  for (let no = 0; no < seatCount; no++) {
    const pos = ringSeat(ring, no, seatCount, base);
    if (!pos) break;
    const holder = room.seats[no];
    const basePlayer = holder && room.players[holder] ? room.players[holder] : null;

    if (!basePlayer) {
      if (gameOn) continue; /* 牌局中空位收起，把桌面还给牌桌 */
      nodes.push(<Seat key={'s' + no} s={s} onPick={onPick}
        p={{ empty: true, seatNo: no, x: pos.x, y: pos.y }} />);
      continue;
    }

    const gp = bySeat[no] ? bySeat[no].p : null;
    const idx = bySeat[no] ? bySeat[no].idx : -1;
    const isMe = basePlayer.id === 'me';
    const isActive = gameOn && idx >= 0 && g.toAct === idx && !g.done && !g.runout;
    const isOut = gameOn && gp ? (gp.folded || gp.out) : false;
    const won = gameOn && g.winners ? g.winners.find(w => w.id === basePlayer.id) : null;

    /* 牌只在自己手里时看得见；别人的牌要等摊牌，且按他自己亮出的张数展示 */
    const hole = gameOn && gp && gp.hole ? gp.hole : [];
    const showdown = gameOn && g.street === 'showdown' && !!g.showdown;
    const nReveal = revealed && revealed[basePlayer.id] != null ? revealed[basePlayer.id] : (isMe ? hole.length : 0);
    const shown = isMe ? hole : (showdown ? hole.slice(0, Math.max(0, Math.min(nReveal, hole.length))) : []);
    const hasCards = hole.length > 0 && gp && !gp.folded && !gp.out;

    const blue = 'oklch(0.6 0.17 255)', green = 'oklch(0.55 0.14 155)';

    /* 每个座位只有一行文字：状态优先，没状态才显示筹码。 */
    let text = '';
    if (won) text = '赢得 ' + money(won.amount);
    else if (basePlayer.offline) text = '掉线';
    else if (gameOn && gp && gp.waiting) text = '下一手入座';
    else if (gameOn && gp && gp.folded) text = '已弃牌';
    else if (gameOn && gp && gp.allin) text = '已全下';
    else if (gameOn && gp && g.street === 'showdown' && gp.handName) text = gp.handName;

    const chipsText = money(gp ? gp.stack : basePlayer.chips);
    const metaColor = won ? green : basePlayer.offline ? 'oklch(0.56 0.2 25)' : isActive ? blue : '#86868b';

    const border = isActive ? `2px solid ${blue}` : won ? `2px solid ${green}` : '1px solid #ebebe9';
    const shadow = isActive
      ? '0 0 0 5px oklch(0.6 0.17 255 / 0.18),0 4px 14px rgba(0,0,0,0.12)'
      : won ? '0 0 0 6px oklch(0.55 0.14 155 / 0.22),0 4px 14px rgba(0,0,0,0.12)'
        : '0 4px 14px rgba(0,0,0,0.1)';

    nodes.push(
      <Seat key={'s' + no} s={s} onPick={onPick}
        p={{
          seatNo: no, x: pos.x, y: pos.y,
          name: basePlayer.name, ini: basePlayer.ini, hue: basePlayer.hue, isOwner: basePlayer.isOwner,
          meta: text || chipsText,
          metaColor,
          border, shadow,
          op: isOut ? 0.55 : 1,
          filter: isOut ? 'grayscale(1)' : 'none',
          dim: isOut || basePlayer.offline,
          offline: !!basePlayer.offline,
          cards: shown,
          backs: !!hasCards && !isMe && shown.length === 0,
          hero: !!hasCards && isMe,
          isDealer: gameOn && idx === g.dealer,
          blind: gameOn && idx >= 0 && idx === g.sbI ? 'SB' : (gameOn && idx >= 0 && idx === g.bbI ? 'BB' : null),
        }} />
    );

    if (gameOn && gp && gp.bet > 0) {
      /* 下注筹码摆在座位与桌心之间，按同一条环向里收 */
      const bp = ring ? { x: ring.cx + (pos.x - ring.cx) * 0.62, y: ring.cy + (pos.y - ring.cy) * 0.6 } : null;
      if (bp) {
        nodes.push(
          <div key={'b' + no} style={S(`position:absolute;left:${bp.x}px;top:${bp.y}px;transform:translate(-50%,-50%);display:flex;gap:${s.q(6)}px;align-items:center;z-index:1;`)}>
            <ChipStack amt={gp.bet} s={s} />
            <span style={S(`padding:3px 8px;border-radius:999px;background:rgba(0,0,0,0.45);color:#fff;font-size:${s.q(12)}px;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums;`)}>{money(gp.bet)}</span>
          </div>
        );
      }
    }
  }

  const potAmt = gameOn ? RiverPoker.pot(g) : 0;
  /* 牌桌窄的时候公共牌换小一号牌面，五张才不会撑出桌布 */
  const boardKind = box.w && box.w < 520 ? 'opp' : 'board';
  const boardW = boardKind === 'opp' ? 44 : 56;
  const boardH = boardKind === 'opp' ? 62 : 80;

  return (
    <div ref={ref} style={S('position:relative;flex:1;min-height:0;min-width:0;overflow:hidden;')}>
      <div style={S(`position:absolute;left:${inset.l}%;right:${inset.r}%;top:${inset.t}%;bottom:${inset.b}%;border-radius:${feltR}px;background:radial-gradient(120% 90% at 50% 38%, color-mix(in oklch, ${FELT.felt}, white 14%) 0%, ${FELT.felt} 58%, color-mix(in oklch, ${FELT.felt}, black 28%) 100%);box-shadow:0 0 0 ${rail}px ${FELT.rail},0 0 0 ${s.q(13)}px rgba(0,0,0,0.3),0 ${s.q(22)}px ${s.q(50)}px rgba(0,0,0,0.22),inset 0 0 ${s.q(50)}px rgba(0,0,0,0.35);`)} />
      <div style={S(`position:absolute;left:calc(${inset.l}% + ${s.q(18)}px);right:calc(${inset.r}% + ${s.q(18)}px);top:calc(${inset.t}% + ${s.q(18)}px);bottom:calc(${inset.b}% + ${s.q(18)}px);border-radius:${Math.max(8, feltR - 18)}px;border:1px solid rgba(255,255,255,0.12);pointer-events:none;`)} />

      <div style={S(`position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:${s.q(12)}px;z-index:1;max-width:94%;`)}>
        {mode === 'room' ? (
          <>
            <div style={S(`display:flex;gap:${s.q(8)}px;align-items:baseline;padding:6px 14px;background:rgba(0,0,0,0.38);color:#fff;border-radius:999px;font-size:${s.q(14)}px;white-space:nowrap;`)}>
              <span style={S('opacity:0.75;')}>房间号</span>
              <span style={S('font-weight:600;letter-spacing:0.08em;font-family:ui-monospace,Menlo,monospace;')}>{room.code}</span>
            </div>
            <div style={S(`display:flex;flex-direction:column;align-items:center;gap:${s.q(4)}px;`)}>
              <span style={S(`font-size:${s.q(13)}px;color:rgba(255,255,255,0.86);`)}>{room.seats.filter(Boolean).length} / {seatCount} 人已入座</span>
              <span style={S(`font-size:${s.q(12)}px;color:rgba(255,255,255,0.62);`)}>{meSeat == null ? '点空位坐下' : '点别的空位可以换座'}</span>
            </div>
          </>
        ) : (
          <>
            <div style={S(`display:flex;align-items:center;gap:${s.q(8)}px;min-height:${s.q(30)}px;`)}>
              {potAmt > 0 ? <ChipStack amt={potAmt} s={s} /> : null}
              <div style={S(`display:flex;gap:${s.q(8)}px;align-items:baseline;padding:6px 14px;background:rgba(0,0,0,0.38);color:#fff;border-radius:999px;font-size:${s.q(14)}px;white-space:nowrap;`)}>
                <span style={S('opacity:0.75;')}>底池</span>
                <span style={S('font-weight:600;font-variant-numeric:tabular-nums;')}>{money(potAmt)}</span>
              </div>
            </div>
            <div style={S(`display:flex;gap:${s.q(7)}px;`)}>
              {[0, 1, 2, 3, 4].map(k => g.board[k]
                ? <PCard key={k} kind={boardKind} code={g.board[k]} s={s} />
                : <div key={k} style={S(`width:${s.q(boardW)}px;height:${s.q(boardH)}px;box-sizing:border-box;border:1.5px dashed rgba(255,255,255,0.22);border-radius:${s.q(7)}px;`)} />)}
            </div>
            <span style={S(`font-size:${s.q(12)}px;color:rgba(255,255,255,0.7);white-space:nowrap;`)}>第 {g.hand} 手 · {room.streetName}</span>
            {status && status.text ? (
              <div style={S(`display:flex;align-items:center;gap:${s.q(8)}px;padding:3px 12px;border-radius:999px;background:rgba(0,0,0,0.34);color:#fff;font-size:${s.q(12)}px;max-width:100%;overflow:hidden;`)}>
                <span style={S('white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{status.text}</span>
                {status.sec != null ? <span style={S('flex:none;font-variant-numeric:tabular-nums;color:rgba(255,255,255,0.72);')}>{status.sec}s</span> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {nodes}
    </div>
  );
}

Object.assign(window, { TableStage, PCard, CardBacks, ChipStack, stacksOf, RED });
