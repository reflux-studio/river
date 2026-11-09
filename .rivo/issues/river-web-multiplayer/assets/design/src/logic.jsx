/* logic.jsx — 状态、房间流程、牌局循环
 *
 * 房间状态走 reducer；牌局对象由 vendor/poker.js 的规则引擎持有，它是原地修改的，
 * 所以放在 ref 里，用一次 bump() 触发重绘 —— 两套状态各管各的。
 *
 * 依赖：app/src/tokens.jsx、tokens.jsx、ui.jsx、felt.jsx、room.jsx、table.jsx、settings.jsx
 */

const STREET_NAME = { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌', idle: '等待开始' };
const ROOM_CODE = 'R7K2Q9';
/* 座位数不再让房主选：进去之后几个人都能开局，选它没有意义。桌上一律 10 个固定坑位。 */
const SEAT_COUNT = 10;
const DEFAULT_SB = 10;
const DEFAULT_BB = 20;
const POKER_OK = typeof window !== 'undefined' && !!window.RiverPoker;

const ROSTER = {
  me: { id: 'me', name: '你', ini: '你', hue: 205 },
  wang: { id: 'wang', name: '老王', ini: '王', hue: 28, persona: { tight: .55, aggr: .6, bluff: .25, call: .35 } },
  may: { id: 'may', name: '阿May', ini: 'M', hue: 340, persona: { tight: .35, aggr: .75, bluff: .5, call: .45 } },
  jiang: { id: 'jiang', name: '江江', ini: '江', hue: 155, persona: { tight: .7, aggr: .45, bluff: .15, call: .25 } },
  shi: { id: 'shi', name: '石头', ini: '石', hue: 265, offline: true, persona: { tight: .92, aggr: .4, bluff: .05, call: .1 } },
  zhao: { id: 'zhao', name: '小赵', ini: '赵', hue: 95, persona: { tight: .45, aggr: .55, bluff: .3, call: .4 } },
};

/* ---------------- 房间状态 ---------------- */

function initState() {
  return {
    screen: 'lobby',
    code: ROOM_CODE,
    ownerId: 'me',
    seatCount: SEAT_COUNT,
    sb: 10, bb: 20,
    profile: null,   /* { name }：填过一次就一直用，换座不再问 */
    actionSec: 30, showSec: 10, spectate: true,
    seats: Array(10).fill(null),
    players: {},
    spectators: [],
    paused: false,
    chat: [],
    coachOn: false,
  };
}

/* 昵称决定头像字和色相，用户不用再挑颜色；同名永远同色 */
function nameHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
function profileOf(name) {
  const n = String(name || '').trim().slice(0, 8) || '玩家';
  return { name: n, ini: n.slice(0, 1), hue: nameHue(n) };
}

function makePlayers(seatIds, buyIn, ownerId) {
  const out = {};
  seatIds.forEach(id => {
    if (!id) return;
    const r = ROSTER[id];
    out[id] = { id, name: r.name, ini: r.ini, hue: r.hue, chips: buyIn, boughtIn: buyIn, isOwner: id === ownerId, offline: !!r.offline };
  });
  return out;
}

function putSeat(seats, no, id) { if (no < seats.length && !seats[no]) seats[no] = id; }

function createRoom(cfg) {
  /* 买入是玩家自己的事：这里只给已经坐下的演示玩家一个默认值 */
  const seatBuyIn = cfg.bb * 100;
  const seats = Array(cfg.seatCount).fill(null);
  putSeat(seats, 1, 'wang');
  putSeat(seats, 3, 'may');
  putSeat(seats, 5, 'jiang');
  if (cfg.seatCount > 8) putSeat(seats, 8, 'shi');
  const players = makePlayers(seats, seatBuyIn, 'me');
  players.zhao = { id: 'zhao', name: '小赵', ini: '赵', hue: 95, chips: 0, isOwner: false, offline: false };
  return {
    ...initState(),
    screen: 'room',
    seatCount: cfg.seatCount,
    sb: cfg.sb, bb: cfg.bb,
    seats, players,
    spectators: ['zhao'],
    chat: [
      { kind: 'sys', text: '房间已创建 · 盲注 ' + cfg.sb + ' / ' + cfg.bb },
      { kind: 'msg', name: '老王', hue: 28, ini: '王', text: '来了来了，等我两分钟' },
      { kind: 'msg', name: '阿May', hue: 340, ini: 'M', text: '今天手气应该不错吧' },
    ],
  };
}

function joinRoom() {
  const seats = Array(10).fill(null);
  putSeat(seats, 1, 'wang');
  putSeat(seats, 2, 'may');
  putSeat(seats, 3, 'jiang');
  putSeat(seats, 4, 'shi');
  return {
    ...initState(),
    screen: 'room',
    ownerId: 'wang',
    seats,
    players: makePlayers(seats, 2000, 'wang'),
    chat: [
      { kind: 'sys', text: '你加入了房间 ' + ROOM_CODE },
      { kind: 'msg', name: '江江', hue: 155, ini: '江', text: '新人来了，快坐' },
      { kind: 'msg', name: '石头', hue: 265, ini: '石', text: '…' },
    ],
  };
}

function reducer(state, a) {
  switch (a.type) {
    case 'CREATE': return createRoom(a.cfg);
    case 'JOIN': return joinRoom();

    /* 首次入座：昵称和买入一起提交，之后记在 profile 里 */
    case 'SIT': {
      const seats = state.seats.slice();
      const from = seats.indexOf('me');
      if (seats[a.seat] && seats[a.seat] !== 'me') return state;
      if (from >= 0) seats[from] = null;
      seats[a.seat] = 'me';
      const who = profileOf(a.name);
      const players = state.players.me ? {
        ...state.players,
        me: { ...state.players.me, ...who },
      } : {
        ...state.players,
        me: { id: 'me', ...who, chips: a.buyIn, boughtIn: a.buyIn, isOwner: state.ownerId === 'me', offline: false },
      };
      return {
        ...state, seats, players, profile: who,
        chat: [...state.chat, { kind: 'sys', text: who.name + ' 坐到 ' + (a.seat + 1) + ' 号位 · 买入 ' + money(a.buyIn) }].slice(-120),
      };
    }

    /* 换座：已经坐下了，直接挪，不再弹买入 */
    case 'MOVE': {
      const seats = state.seats.slice();
      const from = seats.indexOf('me');
      if (from < 0 || (seats[a.seat] && seats[a.seat] !== 'me')) return state;
      seats[from] = null;
      seats[a.seat] = 'me';
      return { ...state, seats, chat: [...state.chat, { kind: 'sys', text: '你换到 ' + (a.seat + 1) + ' 号位' }].slice(-120) };
    }

    case 'SET_NAME': {
      const who = profileOf(a.name);
      const players = state.players.me ? { ...state.players, me: { ...state.players.me, ...who } } : state.players;
      return { ...state, players, profile: who };
    }

    case 'STAND': {
      const seats = state.seats.slice();
      const from = seats.indexOf('me');
      if (from < 0) return state;
      seats[from] = null;
      return {
        ...state, seats, screen: 'room', paused: false,
        chat: [...state.chat, { kind: 'sys', text: '你离座了，' + (state.screen === 'game' ? '本手按弃牌处理' : '座位已空出') }].slice(-120),
      };
    }

    case 'START':
      return { ...state, screen: 'game', paused: false, chat: [...state.chat, { kind: 'sys', text: a.by + ' 开始了牌局' }].slice(-120) };

    case 'APPLY': return { ...state, seats: a.seats };

    case 'SETTLE': {
      const players = { ...state.players };
      a.stacks.forEach(x => { if (players[x.id]) players[x.id] = { ...players[x.id], chips: x.chips }; });
      return { ...state, players };
    }

    case 'TRANSFER': {
      const players = { ...state.players };
      Object.keys(players).forEach(id => { players[id] = { ...players[id], isOwner: id === a.to }; });
      return { ...state, ownerId: a.to, players, chat: [...state.chat, { kind: 'sys', text: '房主已转让给 ' + players[a.to].name }].slice(-120) };
    }

    case 'REMOVE': {
      const players = { ...state.players };
      const name = players[a.id] ? players[a.id].name : '';
      delete players[a.id];
      return {
        ...state,
        seats: state.seats.map(id => (id === a.id ? null : id)),
        players,
        chat: [...state.chat, { kind: 'sys', text: name + ' 被移出了房间' }].slice(-120),
      };
    }

    /* 改盲注不动筹码：买入是每个人自己的，房主不该替他重置 */
    case 'SETTINGS':
      return { ...state, ...a.patch, chat: [...state.chat, { kind: 'sys', text: '房主更新了房间设置' }].slice(-120) };

    /* 补码：只加自己的筹码，盈亏基线跟着抬高 */
    case 'REBUY': {
      const p0 = state.players[a.id || 'me'];
      if (!p0) return state;
      const add = Math.max(0, Math.round(a.buyIn || 0));
      if (!add) return state;
      const players = { ...state.players, [p0.id]: { ...p0, chips: p0.chips + add, boughtIn: (p0.boughtIn || 0) + add } };
      return { ...state, players, chat: [...state.chat, { kind: 'sys', text: p0.name + ' 补码 ' + money(add) }].slice(-120) };
    }

    case 'PAUSE':
      return { ...state, paused: a.on, chat: [...state.chat, { kind: 'sys', text: a.on ? '房主暂停了牌局' : '牌局继续' }].slice(-120) };

    case 'CHAT': return { ...state, chat: [...state.chat, a.m].slice(-120) };
    case 'COACH': return { ...state, coachOn: a.on };
    case 'LEAVE': return initState();

    default: return state;
  }
}

/* ---------------- 牌局 ---------------- */

function buildGame(seats, room, handNo) {
  const ps = [];
  seats.forEach((pid, no) => {
    if (!pid) return;
    const p = room.players[pid];
    if (!p || p.offline) return; /* 掉线的人这一手不参与，座位上仍显示掉线态 */
    ps.push({ id: pid, name: p.name, seatNo: no, stack: p.chips });
  });
  if (ps.length < 2) return null;
  const g = RiverPoker.newGame({ players: ps, sb: room.sb, bb: room.bb });
  if (handNo) g.hand = handNo - 1;
  RiverPoker.startHand(g);
  return g;
}

/* ---------------- 大厅 ---------------- */

function LobbyScreen({ onCreate, onJoin, joinCode, setJoinCode, joinErr, phone }) {
  /* 盲注和买入都改成手填：Blinds 用两个数字框，买入默认跟着大盲走，
     一旦自己改过就不再被覆盖。 */
  const [sb, setSb] = React.useState(DEFAULT_SB);
  const [bb, setBb] = React.useState(DEFAULT_BB);
  const changeSb = v => {
    const n = toInt(v, DEFAULT_SB, 1);
    const nextBb = Math.max(n, toInt(bb, DEFAULT_BB, 1));
    setSb(n);
    setBb(nextBb);
  };
  const changeBb = v => {
    const n = Math.max(toInt(v, DEFAULT_BB, 1), toInt(sb, DEFAULT_SB, 1));
    setBb(n);
  };

  const create = () => {
    const sbV = toInt(sb, DEFAULT_SB, 1);
    const bbV = Math.max(toInt(bb, DEFAULT_BB, 1), sbV);
    onCreate({ seatCount: SEAT_COUNT, sb: sbV, bb: bbV });
  };

  /* 设置行：列数由 .form-row 的断点决定，结构只有三段（标签 / 控件 / 备注）。
     手机上竖排：标签 → 控件整宽 → 备注；不再把三样塞进一条横排靠换行兜底。 */
  const fieldRow = (label, control, hint) => (
    <div className="form-row" style={{ padding: 0 }}>
      <span className="form-row__label">{label}</span>
      {hint ? <span className="form-row__hint">{hint}</span> : null}
      <div className="form-row__control">{control}</div>
    </div>
  );

  /* 页面留白也按断点换档，不是把桌面版的 40/24 直接搬过来：
     手机上外侧 16、卡片内 16，中间的可用宽度留给控件。 */
  const pagePad = phone ? `${SP.xl}px ${SP.lg}px 48px` : '40px 24px 64px';
  const cardPad = phone ? SP.lg : SP.xl;

  return (
    <div style={S('flex:1;min-height:0;overflow-y:auto;background:#fbfbfa;')}>
      <div style={S(`max-width:820px;margin:0 auto;padding:${pagePad};display:flex;flex-direction:column;gap:20px;`)}>
        <div>
          <h1 style={S(`font-size:${phone ? 24 : FS.title}px;font-weight:600;letter-spacing:-0.01em;`)}>开一间好友房</h1>
          <p style={S('font-size:15px;color:#6e6e73;line-height:1.65;max-width:44ch;margin-top:8px;text-wrap:pretty;')}>
            发个链接给朋友，各自用手机坐下就能打。每人只看得到自己的底牌，到齐了随时开局，不用等满座。
          </p>
        </div>

        <div style={S(`background:#fff;border:1px solid #ebebe9;border-radius:${R.xxl}px;padding:${cardPad}px;display:flex;flex-direction:column;gap:${SP.lg}px;`)}>
          <div>
            <span style={S(`font-size:${FS.xl}px;font-weight:600;`)}>创建房间</span>
            <p style={S(`font-size:${FS.md}px;color:#86868b;line-height:1.55;margin-top:2px;`)}>你会是房主，能改设置、开局和暂停。桌上固定 10 个座位，坐下几个人都能开局。</p>
          </div>

          {fieldRow('盲注',
            <div style={S(`display:flex;align-items:center;gap:${SP.sm}px;${phone ? 'width:100%;' : ''}`)}>
              <NumField phone={phone} label="小盲" value={sb} onChange={changeSb} min={1} suffix="小盲" />
              <span style={S('font-size:13px;color:#a1a1a6;flex:none;')}>/</span>
              <NumField phone={phone} label="大盲" value={bb} onChange={changeBb} min={1} suffix="大盲" />
            </div>,
            '大盲通常是小盲的 2 倍')}


          {/* 卡片页脚：分隔线上下各留一档 16，主按钮和说明同一行；
              手机上主按钮整宽独占一行，不再挤在分隔线上做一个小胶囊。 */}
          <div style={S(`display:flex;align-items:center;gap:${SP.md}px;padding-top:${SP.lg}px;border-top:1px solid #f0f0ee;`
            + (phone ? 'flex-direction:column;align-items:stretch;' : ''))}>
            <p style={S(`font-size:${FS.sm}px;color:#86868b;line-height:1.5;flex:1;min-width:0;`)}>
              建好后房主随时可以开局，不用等人齐。
            </p>
            <Btn kind="primary" size="lg" block={!!phone} onClick={create}>创建房间</Btn>
          </div>
        </div>

        <div style={S(`background:#fff;border:1px solid #ebebe9;border-radius:${R.xxl}px;padding:${cardPad}px;display:flex;flex-direction:column;gap:${SP.lg}px;`)}>
          <div>
            <span style={S(`font-size:${FS.xl}px;font-weight:600;`)}>加入别人的房间</span>
            <p style={S(`font-size:${FS.md}px;color:#86868b;line-height:1.55;margin-top:2px;`)}>输入朋友发来的房间号，或者直接打开邀请链接。</p>
          </div>
          {/* 输入框与按钮同为 md 档（36），一行里严格等高 */}
          <div style={S(`display:flex;align-items:center;gap:${SP.sm}px;`)}>
            <input className="k-input" value={joinCode} maxLength={8} aria-label="房间号"
              onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="R7K2Q9"
              style={S('flex:1;min-width:0;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.1em;')} />
            <Btn kind="ghost" size="md" onClick={onJoin}>加入</Btn>
          </div>
          {joinErr
            ? <p style={S(`font-size:${FS.sm}px;color:oklch(0.56 0.2 25);line-height:1.5;`)}>{joinErr}</p>
            : <p style={S(`font-size:${FS.sm}px;color:#86868b;line-height:1.5;`)}>示例房间 R7K2Q9，房主是老王，你可以先进去看看普通玩家的样子。</p>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 顶栏 ----------------
 *
 * 两个入口，三档同一套位置：左上「公屏」，右上「房间」。
 * 公屏在桌面是左侧抽屉、手机是底部弹层；房间同理（右侧抽屉 / 底部弹层）。
 * 战绩不再单独占一个入口——它就是房间抽屉里的成员列表（筹码 + 本场盈亏）。 */
function TopBar({ st, seated, phone, onOpenChat, onOpenRoom, onOpenMe, unread, chatOn, roomOn, meOn }) {
  const inRoom = st.screen === 'room' || st.screen === 'game';
  return (
    <header style={S(`height:${phone ? 48 : 52}px;flex:none;display:flex;align-items:center;gap:${SP.sm}px;padding:0 ${phone ? SP.md : SP.lg}px;border-bottom:1px solid #ebebe9;background:#f7f7f5;`)}>
      {inRoom ? (
        <span style={S('position:relative;display:inline-flex;flex:none;')}>
          <Btn kind="quiet" size="sm" onClick={onOpenChat} aria-pressed={!!chatOn}>
            <Icon name="chat" size={16} />公屏
          </Btn>
          {unread > 0 ? (
            <span style={S('position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:oklch(0.58 0.2 25);color:#fff;font-size:10px;font-weight:700;line-height:16px;text-align:center;box-shadow:0 0 0 2px #f7f7f5;font-variant-numeric:tabular-nums;')}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </span>
      ) : (
        <span style={S('font-size:16px;font-weight:600;padding-left:4px;')}>River</span>
      )}

      {inRoom ? (
        <span style={S('display:flex;align-items:center;gap:8px;font-size:13px;color:#86868b;min-width:0;overflow:hidden;')}>
          <span style={S('font-family:ui-monospace,Menlo,monospace;letter-spacing:0.06em;color:#55555a;white-space:nowrap;')}>{st.code}</span>
          {!phone ? <span style={S('white-space:nowrap;')}>{seated} / {st.seatCount}</span> : null}
          <span style={S(`width:6px;height:6px;border-radius:50%;flex:none;background:${st.paused ? 'oklch(0.68 0.12 72)' : 'oklch(0.55 0.14 155)'};`)} />
          {!phone ? <span style={S('white-space:nowrap;')}>{st.paused ? '已暂停' : '进行中'}</span> : null}
        </span>
      ) : (
        <span style={S('font-size:14px;color:#86868b;')}>好友联机</span>
      )}

      <div style={S('flex:1;')} />

      {inRoom ? (
        <>
          <Btn kind="ghost" size="sm" onClick={onOpenMe} aria-pressed={!!meOn}>
            <Icon name="user" size={16} />我的
          </Btn>
          <Btn kind="ghost" size="sm" onClick={onOpenRoom} aria-pressed={!!roomOn}>
            <Icon name="users" size={16} />房间
          </Btn>
        </>
      ) : null}
    </header>
  );
}

/* ---------------- 主应用 ---------------- */

function App() {
  const [st, dispatch] = React.useReducer(reducer, null, initState);
  const phone = useMQ(BP.phone);
  const narrow = useMQ(BP.narrow);
  const s = scaleOf();

  if (!POKER_OK) {
    return <div style={S('padding:32px;font-size:14px;')}>牌局规则引擎没加载成功，检查 vendor/poker.js 是否可访问。</div>;
  }
  return <AppInner st={st} dispatch={dispatch} phone={phone} narrow={narrow} s={s} />;
}

function AppInner({ st, dispatch, phone, narrow, s }) {
  const gRef = React.useRef(null);
  const settledRef = React.useRef(0);
  const autoStartRef = React.useRef(false);
  const [gv, setGv] = React.useState(0);
  const bump = React.useCallback(() => setGv(v => v + 1), []);

  const [sec, setSec] = React.useState(30);
  const [raiseTo, setRaiseTo] = React.useState(0);
  const [revealed, setRevealed] = React.useState({});
  const [chatInput, setChatInput] = React.useState('');
  const [copyState, setCopyState] = React.useState('');
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [manageId, setManageId] = React.useState(null);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [joinCode, setJoinCode] = React.useState(ROOM_CODE);
  const [joinErr, setJoinErr] = React.useState('');
  const [sheet, setSheet] = React.useState(null);
  /* 公屏未读：面板/抽屉打开时清零，新消息进来重新累加，角标挂在顶栏按钮上。 */
  const [chatSeen, setChatSeen] = React.useState(0);
  /* 桌面端的两块常驻面板：默认展开，用户点收起之后以手动为准。
     公屏和房间同一条断点——桌面都常驻，1024 以下两块才一起收进抽屉。 */
  const [chatClosed, setChatClosed] = React.useState(false);
  const [roomClosed, setRoomClosed] = React.useState(false);
  const showChat = !narrow && !chatClosed;
  const showRoom = !narrow && !roomClosed;

  /* 同一个按钮：桌面收放常驻面板，窄屏开抽屉。 */
  const openChat = () => { if (!narrow) setChatClosed(v => !v); else setSheet('chat'); };
  const openRoom = () => { if (!narrow) setRoomClosed(v => !v); else setPanelOpen(true); };

  /* 面板/抽屉开着时把「已读」追平；关着的时候新消息叠成角标。 */
  const chatOpen = sheet === 'chat' || showChat;
  React.useEffect(() => {
    if (chatOpen) setChatSeen(st.chat.length);
  }, [chatOpen, st.chat.length]);
  const unread = chatOpen ? 0 : Math.max(0, st.chat.length - chatSeen);

  const g = st.screen === 'game' ? gRef.current : null;
  const mySeat = st.seats.indexOf('me');
  const seated = st.seats.filter(Boolean).length;

  const myIdx = g && mySeat >= 0 ? g.players.findIndex(p => p.seatNo === mySeat) : -1;
  const myTurn = !!(g && !g.done && !g.runout && g.toAct >= 0 && g.toAct === myIdx);
  const legal = g && myIdx >= 0 ? RiverPoker.legal(g, myIdx) : { toCall: 0, canRaise: false, minTo: 0, maxTo: 0, canCheck: true };
  const done = !!(g && g.done);
  const winners = (g && g.winners) || [];
  const streetName = g ? (STREET_NAME[g.street] || '') : '';

  const room = {
    code: st.code, ownerId: st.ownerId, seatCount: st.seatCount,
    sb: st.sb, bb: st.bb,
    actionSec: st.actionSec, showSec: st.showSec, spectate: st.spectate,
    seats: st.seats, players: st.players, spectators: st.spectators,
    paused: st.paused, secLeft: sec, streetName,
  };

  const me = st.players.me || { id: 'me', name: '你', ini: '你', hue: 205, chips: 0, boughtIn: 0 };

  const startGame = React.useCallback((by) => {
    const next = buildGame(st.seats, st, 1);
    if (!next) return;
    gRef.current = next;
    settledRef.current = 0;
    setRevealed({});
    const byName = by || (st.ownerId === 'me' ? '你' : (st.players[st.ownerId] ? st.players[st.ownerId].name : '房主'));
    dispatch({ type: 'START', by: byName });
    bump();
  }, [st.seats, st.players, st.ownerId, st.sb, st.bb]);

  const nextHand = React.useCallback(() => {
    const handNo = (gRef.current ? gRef.current.hand : 0) + 1;
    const next = buildGame(st.seats, st, handNo);
    if (!next) return;
    gRef.current = next;
    settledRef.current = 0;
    setRevealed({});
    dispatch({ type: 'APPLY', seats: st.seats });
    bump();
  }, [st.seats, st.players, st.sb, st.bb]);

  const doAct = React.useCallback((type) => {
    const cur = gRef.current;
    if (!cur || cur.done || cur.runout || cur.toAct < 0) return;
    const idx = cur.toAct;
    if (!cur.players[idx] || cur.players[idx].id !== 'me') return;
    const L = RiverPoker.legal(cur, idx);
    const a = { type };
    if (type === 'fold' && L.toCall === 0) a.type = 'check';
    if (type === 'call' && L.toCall === 0) a.type = 'check';
    if (type === 'raise') {
      if (!L.canRaise) return;
      a.to = Math.max(L.minTo, Math.min(L.maxTo, raiseTo));
    }
    const label = RiverPoker.apply(cur, idx, a);
    dispatch({ type: 'CHAT', m: { kind: 'act', name: '你', text: label } });
    bump();
  }, [raiseTo]);

  const doActRef = React.useRef(doAct); doActRef.current = doAct;
  const startRef = React.useRef(startGame); startRef.current = startGame;

  /* 别人的回合：本地规则引擎代打 */
  React.useEffect(() => {
    if (st.screen !== 'game') return;
    const cur = gRef.current;
    if (!cur || cur.done || cur.runout || cur.toAct < 0) return;
    const p = cur.players[cur.toAct];
    if (p.id === 'me' || st.paused) return;
    const t = setTimeout(() => {
      const persona = (ROSTER[p.id] && ROSTER[p.id].persona) || { tight: .5, aggr: .5, bluff: .3, call: .4 };
      const a = RiverPoker.decide(cur, cur.toAct, persona);
      const label = RiverPoker.apply(cur, cur.toAct, a);
      dispatch({ type: 'CHAT', m: { kind: 'act', name: p.name, text: label } });
      bump();
    }, 1400);
    return () => clearTimeout(t);
  }, [gv, st.screen, st.paused, bump]);

  /* 计时：每次行动后重置，暂停时冻结 */
  const timeoutRef = React.useRef(() => {});
  timeoutRef.current = () => {
    const cur = gRef.current;
    if (!cur || cur.done || cur.runout || cur.toAct < 0) return;
    if (cur.players[cur.toAct].id !== 'me') return;
    const L = RiverPoker.legal(cur, cur.toAct);
    doActRef.current(L.toCall === 0 ? 'check' : 'fold');
  };

  React.useEffect(() => {
    if (st.screen !== 'game') return;
    const cur = gRef.current;
    if (!cur || cur.done || cur.runout || cur.toAct < 0) return;
    setSec(st.actionSec);
    if (st.paused) return;
    let left = st.actionSec;
    const id = setInterval(() => {
      left -= 1;
      setSec(Math.max(0, left));
      if (left <= 0) { clearInterval(id); timeoutRef.current(); }
    }, 1000);
    return () => clearInterval(id);
  }, [gv, st.screen, st.paused, st.actionSec]);

  /* 轮到我时给加注一个默认值（与桌面端同一套算法） */
  React.useEffect(() => {
    if (st.screen !== 'game') return;
    const cur = gRef.current;
    if (!cur || cur.done || cur.toAct < 0) return;
    if (cur.players[cur.toAct].id !== 'me') return;
    const L = RiverPoker.legal(cur, cur.toAct);
    if (!L.canRaise) return;
    const base = cur.currentBet === 0 ? RiverPoker.pot(cur) * 0.5 : cur.currentBet * 2.5;
    setRaiseTo(Math.max(L.minTo, Math.min(L.maxTo, Math.round(base / st.bb) * st.bb)));
  }, [gv, st.screen, st.bb]);

  /* 结算：筹码写回房间，同时给出每个人默认亮几张 */
  React.useEffect(() => {
    if (st.screen !== 'game') return;
    const cur = gRef.current;
    if (!cur || !cur.done) return;
    if (settledRef.current === cur.hand) return;
    settledRef.current = cur.hand;

    const stacks = cur.players.map(p => ({ id: p.id, chips: Math.max(0, p.stack) }));
    dispatch({ type: 'SETTLE', stacks });

    const rv = {};
    cur.players.forEach(p => {
      if (p.id === 'me') rv[p.id] = cur.showdown ? p.hole.length : 0;
      else if (cur.showdown && !p.folded) {
        const isWinner = (cur.winners || []).some(w => w.id === p.id);
        rv[p.id] = isWinner ? 2 : (Math.random() < 0.5 ? 1 : 0);
      } else rv[p.id] = 0;
    });
    setRevealed(rv);

    (cur.winners || []).forEach(w => {
      const nm = ROSTER[w.id] ? ROSTER[w.id].name : w.id;
      dispatch({ type: 'CHAT', m: { kind: 'sys', text: nm + ' 赢得 ' + money(w.amount) + (w.handName ? ' · ' + w.handName : '') } });
    });
  }, [gv, st.screen]);

  /* 街名进公屏 */
  const streetRef = React.useRef('');
  React.useEffect(() => {
    if (st.screen !== 'game') return;
    const cur = gRef.current;
    if (!cur || streetRef.current === cur.street) return;
    streetRef.current = cur.street;
    if (cur.street === 'flop' || cur.street === 'turn' || cur.street === 'river') {
      dispatch({ type: 'CHAT', m: { kind: 'sys', text: STREET_NAME[cur.street] + ' · ' + cur.board.join(' ') } });
    }
  }, [gv, st.screen]);

  /* 访客路径：房主是模拟的，坐下后由房主开局 */
  React.useEffect(() => {
    if (st.screen !== 'room' || st.ownerId === 'me') return;
    if (st.seats.indexOf('me') < 0 || autoStartRef.current) return;
    autoStartRef.current = true;
    const t = setTimeout(() => {
      dispatch({ type: 'CHAT', m: { kind: 'msg', name: '老王', hue: 28, ini: '王', text: '人齐了，开了' } });
      startRef.current(st.players[st.ownerId] ? st.players[st.ownerId].name : '老王');
    }, 2400);
    return () => clearTimeout(t);
  }, [st.screen, st.ownerId, st.seats]);

  /* 键盘 F / C / R */
  React.useEffect(() => {
    const h = e => {
      if (st.screen !== 'game') return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = String(e.key || '').toLowerCase();
      if (k === 'f') doActRef.current('fold');
      else if (k === 'c') doActRef.current('call');
      else if (k === 'r') doActRef.current('raise');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [st.screen]);

  const onCopy = () => {
    let link = st.code;
    try { link = window.location.origin + window.location.pathname + '?room=' + st.code; } catch (e) {}
    const ok = () => { setCopyState('ok'); setTimeout(() => setCopyState(''), 2200); };
    const bad = () => { setCopyState('fail'); setTimeout(() => setCopyState(''), 3200); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok).catch(bad);
      else bad();
    } catch (e) { bad(); }
  };

  /* 点空位先问买入：盲注是房间的，买入是这个人自己的 */
  const [buyInSheet, setBuyInSheet] = React.useState(null);
  const [joinName, setJoinName] = React.useState('');
  const [meOpen, setMeOpen] = React.useState(false);
  const [buyInVal, setBuyInVal] = React.useState(0);
  const BI_PRESETS = [20, 50, 100];

  const openBuyIn = target => {
    setBuyInVal(st.bb * 100);
    setBuyInSheet(target);
  };
  const confirmBuyIn = () => {
    if (!buyInSheet) return;
    const v = Math.max(toInt(buyInVal, st.bb * 100, 0), st.bb * 20);
    if (buyInSheet.rebuy) dispatch({ type: 'REBUY', id: 'me', buyIn: v });
    else dispatch({ type: 'SIT', seat: buyInSheet.seat, buyIn: v, name: joinName });
    setBuyInSheet(null);
  };

  /* 第一次坐下：昵称 + 买入一次问完；已经坐下了：换座直接挪，不再弹窗 */
  const onPick = no => {
    if (st.seats[no] === 'me' || st.seats[no]) return;
    if (st.seats.indexOf('me') >= 0) { dispatch({ type: 'MOVE', seat: no }); return; }
    setJoinName(st.profile ? st.profile.name : '');
    openBuyIn({ seat: no });
  };

  const sendChat = () => {
    const t = chatInput.trim();
    if (!t) return;
    dispatch({ type: 'CHAT', m: { kind: 'msg', name: '你', hue: 205, ini: '你', text: t } });
    setChatInput('');
  };

  const leaveRoom = () => {
    gRef.current = null;
    settledRef.current = 0;
    autoStartRef.current = false;
    dispatch({ type: 'LEAVE' });
    setLeaveOpen(false);
    setPanelOpen(false);
  };

  const standUp = () => {
    gRef.current = null;
    settledRef.current = 0;
    dispatch({ type: 'STAND' });
    setPanelOpen(false);
  };

  const isOwner = st.ownerId === 'me';
  const managePlayer = manageId ? st.players[manageId] : null;
  const inRoom = st.screen === 'room' || st.screen === 'game';
  const closeRoom = () => setPanelOpen(false);

  /* 房间面板/抽屉共用的一份内容与底部操作——宽屏常驻，窄屏弹层，不写两遍。 */
  const roomSub = '房间号 ' + st.code + ' · ' + (isOwner ? '你是房主' : '房主是 ' + (st.players[st.ownerId] ? st.players[st.ownerId].name : ''));
  const roomBody = (
    <RoomBody room={room} me={me} g={g} seated={seated} inGame={st.screen === 'game'} isOwner={isOwner}
      paused={st.paused} coachOn={st.coachOn} copyState={copyState}
      onCopy={onCopy}
      onStart={() => { closeRoom(); startGame(); }}
      onPause={() => dispatch({ type: 'PAUSE', on: !st.paused })}
      onOpenSettings={() => { closeRoom(); setSettingsOpen(true); }}
      onManage={setManageId}
      onCoach={on => dispatch({ type: 'COACH', on })} />
  );

  return (
    <div style={S('height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:#fbfbfa;')}>
      <TopBar st={st} seated={seated} phone={phone} unread={unread}
        chatOn={showChat} roomOn={showRoom} meOn={meOpen}
        onOpenChat={openChat} onOpenRoom={openRoom} onOpenMe={() => { setJoinName((st.profile && st.profile.name) || ''); setMeOpen(true); }} />

      <div style={S('flex:1;min-height:0;display:flex;')}>
        {/* 宽屏常驻：左公屏 */}
        {inRoom && showChat ? (
          <ChatPanel code={st.code} chat={st.chat} value={chatInput} onChange={setChatInput} onSend={sendChat}
            onCollapse={() => setChatClosed(true)} />
        ) : null}

        <div style={S('flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;')}>
          {st.screen === 'lobby' ? (
            <LobbyScreen
              onCreate={cfg => dispatch({ type: 'CREATE', cfg })}
              onJoin={() => {
                const code = joinCode.trim().toUpperCase();
                if (!code) { setJoinErr('先填一个房间号，示例房间是 R7K2Q9。'); return; }
                if (code !== ROOM_CODE) { setJoinErr('没找到 ' + code + ' 这个房间，它可能已经关闭了。试试 R7K2Q9。'); return; }
                setJoinErr('');
                dispatch({ type: 'JOIN' });
              }}
              joinCode={joinCode} setJoinCode={setJoinCode} joinErr={joinErr} phone={phone} />
          ) : null}

          {st.screen === 'room' ? (
            <RoomScreen room={room} me={me} s={s} onPick={onPick} isOwner={isOwner} />
          ) : null}

          {st.screen === 'game' && g ? (
            <GameScreen room={room} me={me} g={g} s={s} phone={phone} mySeat={mySeat}
              legal={legal} raiseTo={raiseTo} setRaiseTo={setRaiseTo}
              myTurn={myTurn} done={done} winners={winners}
              onAct={doAct} onNext={nextHand} onRebuy={() => openBuyIn({ rebuy: true })} secLeft={sec}
              revealed={revealed}
              onReveal={v => setRevealed(r => ({ ...r, me: v }))} />
          ) : null}
        </div>

        {/* 宽屏常驻：右房间（房间号、邀请、成员与本场盈亏、房主操作、教练、退出） */}
        {inRoom && showRoom ? (
          <Panel side="right" width={340} title="房间" sub={roomSub}
            onCollapse={() => setRoomClosed(true)}>
            {roomBody}
          </Panel>
        ) : null}
      </div>

      {/* 窄屏才走抽屉：公屏在左，房间在右，内容与上面两块面板完全相同 */}
      <Drawer open={sheet === 'chat' && narrow} onClose={() => setSheet(null)} side="left" bare
        title="公屏" sub={'房间 ' + st.code}>
        <ChatList chat={st.chat} />
        <ChatForm value={chatInput} onChange={setChatInput} onSend={sendChat} />
      </Drawer>

      {/* 买入：坐下前选自己的筹码；输光后补码走同一个弹层 */}
      <Sheet open={!!buyInSheet} onClose={() => setBuyInSheet(null)}
        title={buyInSheet && buyInSheet.rebuy ? '补码' : '入座'}
        sub={buyInSheet && buyInSheet.rebuy
          ? `当前筹码 ${money(me.chips || 0)} · 补码会累加到你的本金里`
          : `第 ${buyInSheet ? buyInSheet.seat + 1 : ''} 号位 · 盲注 ${st.sb} / ${st.bb} · 昵称和买入只填这一次`}
        footer={<>
          <Btn kind="ghost" style={{ flex: 1 }} onClick={() => setBuyInSheet(null)}>取消</Btn>
          <Btn kind="primary" style={{ flex: 1 }} onClick={confirmBuyIn}>
            {buyInSheet && buyInSheet.rebuy ? '补码 ' + money(toInt(buyInVal, st.bb * 100, 0)) : '以 ' + money(toInt(buyInVal, st.bb * 100, 0)) + ' 入座'}
          </Btn>
        </>}>
        {buyInSheet && !buyInSheet.rebuy ? (
          <Row label="昵称" hint="别人在牌桌和成员列表里看到的名字">
            <input className="k-input" value={joinName} maxLength={8} placeholder="给自己起个名字"
              aria-label="昵称" onChange={e => setJoinName(e.target.value)}
              style={S('width:160px;')} />
          </Row>
        ) : null}
        <Row label={buyInSheet && buyInSheet.rebuy ? '补码' : '买入'} hint={buyInSheet && buyInSheet.rebuy ? '只加自己的筹码，盈亏基线跟着抬高' : '带多少上桌由你自己决定，盈亏按这个数算'}>
          <NumField label="买入筹码" value={buyInVal} onChange={setBuyInVal} min={0} width={140} suffix="筹码" />
        </Row>
        <div style={S(`display:flex;gap:${SP.sm}px;flex-wrap:wrap;`)}>
          {BI_PRESETS.map(n => (
            <Btn key={n} kind="ghost" onClick={() => setBuyInVal(st.bb * n)}>{n} BB</Btn>
          ))}
        </div>
      </Sheet>

      {/* 我的：昵称随时可改，补码 / 离座 / 离开都在这，和「房间」并列 */}
      <Sheet open={meOpen} onClose={() => setMeOpen(false)}
        title="我的"
        sub={mySeat >= 0 ? `第 ${mySeat + 1} 号位 · 筹码 ${money(me.chips || 0)} · 本金 ${money(me.boughtIn || 0)}` : '还没入座'}
        footer={<Btn kind="ghost" style={{ flex: 1 }} onClick={() => setMeOpen(false)}>关闭</Btn>}>
        <Row label="昵称" hint="改完立刻同步到房间和牌桌">
          <input className="k-input" value={joinName} maxLength={8} placeholder="给自己起个名字"
            aria-label="昵称"
            onChange={e => { setJoinName(e.target.value); dispatch({ type: 'SET_NAME', name: e.target.value }); }}
            style={S('width:160px;')} />
        </Row>

        <div style={S('display:flex;align-items:center;gap:12px;')}>
          <Avatar hue={(st.profile && st.profile.hue) || 205} size={40}>{(st.profile && st.profile.ini) || '你'}</Avatar>
          <span style={S('font-size:13px;color:#86868b;line-height:1.5;')}>
            头像是昵称首字自动生成的，不用单独挑颜色。
          </span>
        </div>

        {mySeat >= 0 ? (
          <div style={S('display:flex;flex-direction:column;gap:8px;')}>
            <span style={S('font-size:13px;font-weight:600;')}>补码</span>
            <div style={S('display:flex;gap:8px;align-items:center;flex-wrap:wrap;')}>
              <NumField label="补码筹码" value={buyInVal} onChange={setBuyInVal} min={0} width={140} suffix="筹码" />
              {BI_PRESETS.map(n => (
                <Btn key={n} kind="ghost" onClick={() => setBuyInVal(st.bb * n)}>{n} BB</Btn>
              ))}
            </div>
            <div>
              <Btn kind="primary" onClick={() => { const v = Math.max(toInt(buyInVal, st.bb * 100, 0), st.bb * 20); dispatch({ type: 'REBUY', id: 'me', buyIn: v }); setMeOpen(false); }}>
                确认补码
              </Btn>
            </div>
          </div>
        ) : (
          <Note>坐下时再选买入。现在点牌桌上的空位就可以入座。</Note>
        )}

        <div style={S('display:flex;flex-direction:column;gap:8px;')}>
          {mySeat >= 0 ? <Btn kind="ghost" block onClick={() => { setMeOpen(false); standUp(); }}>离座（本手弃牌）</Btn> : null}
          <Btn kind="quiet" block onClick={() => { setMeOpen(false); setLeaveOpen(true); }}>离开房间</Btn>
        </div>
      </Sheet>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)}
        room={room} live={st.screen === 'game'} phone={phone}
        onSave={patch => { dispatch({ type: 'SETTINGS', patch }); setSettingsOpen(false); }} />

      <Drawer open={panelOpen && narrow} onClose={closeRoom} side="right"
        title="房间" sub={roomSub}>
        {roomBody}
      </Drawer>

      {/* 房主管理某位成员 */}
      <Sheet open={!!managePlayer} onClose={() => setManageId(null)}
        title={managePlayer ? managePlayer.name : ''} sub="房主操作">
        {managePlayer ? (
          <div style={S('display:flex;flex-direction:column;gap:8px;')}>
            <Btn kind="ghost" block onClick={() => { dispatch({ type: 'TRANSFER', to: managePlayer.id }); setManageId(null); }}>
              把房主转让给 {managePlayer.name}
            </Btn>
            <Btn kind="danger" block onClick={() => { dispatch({ type: 'REMOVE', id: managePlayer.id }); setManageId(null); }}>
              移出房间
            </Btn>
            <Note>转让之后就换成对方的视角，刷新页面可以回到房主视角。</Note>
          </div>
        ) : null}
      </Sheet>

      {/* 离开房间 */}
      <Sheet open={leaveOpen} onClose={() => setLeaveOpen(false)}
        title="离开房间？" sub={st.screen === 'game' ? '牌局还在进行，离开后本手按弃牌处理。' : '座位会空出来。'}
        footer={<>
          <Btn kind="ghost" style={{ flex: 1 }} onClick={() => setLeaveOpen(false)}>留下</Btn>
          <Btn kind="danger" style={{ flex: 1 }} onClick={leaveRoom}>离开</Btn>
        </>}>
        <Note>这是本机模拟的房间，离开后回到大厅，可以再建一间或加入示例房间。</Note>
      </Sheet>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
