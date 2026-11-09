/* table.jsx — 牌局
 *
 * 牌桌占满：顶栏在外面，底部只有一行操作。公屏和房间都是抽屉，不占牌桌的地方。
 * 操作按钮带图标和快捷键键帽（F / C / R，键盘监听在 logic.jsx）。
 * 「加注」不显示金额——金额在它自己的弹层里选，按钮只负责开门。
 *
 * 依赖：app/src/tokens.jsx、tokens.jsx、ui.jsx、felt.jsx
 */

function ChatList({ chat }) {
  return (
    <div style={S('flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;')}>
      {chat.map((m, i) => {
        if (m.kind === 'sys') {
          return <div key={i} style={S('display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;color:#a1a1a6;')}><span>— {m.text} —</span></div>;
        }
        if (m.kind === 'act') {
          return (
            <div key={i} style={S('display:flex;gap:8px;align-items:center;font-size:12px;color:#86868b;padding-left:40px;')}>
              <span style={S('font-weight:600;color:#55555a;')}>{m.name}</span>
              <span>{m.text}</span>
            </div>
          );
        }
        return (
          <div key={i} style={S('display:flex;gap:12px;')}>
            <Avatar hue={m.hue} size={28} font={12}>{m.ini}</Avatar>
            <div style={S('display:flex;flex-direction:column;gap:4px;min-width:0;')}>
              <span style={S('font-size:13px;font-weight:600;')}>{m.name}</span>
              <span style={S('font-size:14px;line-height:1.5;text-wrap:pretty;overflow-wrap:anywhere;')}>{m.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ChatForm({ value, onChange, onSend }) {
  return (
    <form onSubmit={e => { e.preventDefault(); onSend(); }}
      style={S(`flex:none;display:flex;align-items:center;gap:${SP.sm}px;padding:${SP.md}px ${SP.md}px calc(${SP.md}px + var(--safe-b));border-top:1px solid #ebebe9;`)}>
      {/* 输入框和发送按钮同为 md 档（36），一行里等高 */}
      <input className="k-input" value={value} placeholder="说点什么…" aria-label="公屏发言"
        onChange={e => onChange(e.target.value)} style={S('flex:1;min-width:0;width:auto;')} />
      <Btn kind="primary" size="md" onClick={onSend}>发送</Btn>
    </form>
  );
}

/* 底部操作栏：一行，图标 + 文案 + 键帽。
 * 加注不显示金额——点它开弹层，金额在那里选。 */
function ActionBar({ g, legal, myTurn, done, winners, me, revealed, onReveal, onAct, onNext, onRebuy, onOpenRaise, raiseTo, phone }) {
  if (done) {
    const win = winners.find(w => w.id === me.id);
    const mine = g.players.find(p => p.id === me.id);
    const net = mine ? mine.stack - (mine.startStack || 0) : 0;
    const canReveal = g.showdown && mine && !mine.folded;
    const rv = revealed[me.id] == null ? 2 : revealed[me.id];
    const others = winners.map(w => (g.players.find(p => p.id === w.id) || {}).name || w.id).join('、');
    return (
      <div style={S(`flex:none;border-top:1px solid #ebebe9;background:#fbfbfa;padding:${SP.md}px ${SP.lg}px calc(${SP.md}px + var(--safe-b));display:flex;flex-direction:column;gap:${SP.md}px;`)}>
        {canReveal ? (
          <div className="form-row form-row--inline" style={{ padding: 0 }}>
            <span className="form-row__label">亮牌</span>
            <div className="form-row__control">
              <Seg block={!!phone} label="亮牌" value={rv} onChange={v => onReveal(v)}
                options={[{ value: 0, label: '不亮' }, { value: 1, label: '亮一张' }, { value: 2, label: '亮两张' }]} />
            </div>
          </div>
        ) : null}
        <div style={S('display:flex;align-items:center;gap:12px;')}>
          <div style={S('display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;')}>
            <span style={S(`font-size:${phone ? 15 : 17}px;font-weight:600;color:${win ? 'oklch(0.55 0.14 155)' : '#1d1d1f'};`)}>
              {win ? '你赢得 ' + money(win.amount) + (win.handName ? ' · ' + win.handName : '') : others + ' 赢下这一手'}
            </span>
            <span style={S('font-size:12px;color:#86868b;')}>
              本手 {net > 0 ? '+' + money(net) : net < 0 ? '−' + money(Math.abs(net)) : '±0'} · 第 {g.hand} 手结束
            </span>
          </div>
          {(g.players.find(p => p.id === me.id) || {}).stack <= 0
            ? <Btn kind="primary" size="lg" onClick={onRebuy}>补码</Btn>
            : <Btn kind="primary" size="lg" onClick={onNext}>下一手</Btn>}
        </div>
      </div>
    );
  }

  const dim = myTurn ? '' : 'opacity:0.45;pointer-events:none;';
  const btn = `flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:${H.lg}px;padding:0 10px;border-radius:${R.lg}px;font-size:15px;cursor:pointer;white-space:nowrap;`;
  const isAllIn = legal.maxTo > 0 && raiseTo >= legal.maxTo;

  return (
    <div style={S(`flex:none;border-top:1px solid #ebebe9;background:#fbfbfa;padding:${phone ? SP.sm : SP.md}px ${SP.md}px calc(${phone ? SP.sm : SP.md}px + var(--safe-b));display:flex;gap:${SP.sm}px;align-items:stretch;` + dim)}>
      {legal.toCall > 0 ? (
        <button type="button" onClick={() => onAct('fold')}
          style={S(btn + 'border:1px solid #e3e3e0;background:#fff;color:#1d1d1f;font-weight:500;')}>
          <Icon name="flag" size={17} /><span>弃牌</span><Key>F</Key>
        </button>
      ) : null}
      <button type="button" onClick={() => onAct(legal.toCall === 0 ? 'check' : 'call')}
        style={S(btn + 'border:1px solid #e3e3e0;background:#fff;color:#1d1d1f;font-weight:600;')}>
        <Icon name="chip" size={17} />
        <span>{legal.toCall === 0 ? '过牌' : '跟注 ' + money(legal.toCall)}</span>
        <Key>C</Key>
      </button>
      <button type="button" onClick={onOpenRaise}
        style={S(btn + `border:0;color:#fff;font-weight:600;background:${isAllIn ? 'linear-gradient(180deg, oklch(0.62 0.21 28), oklch(0.52 0.2 25))' : '#1d1d1f'};`)}>
        <Icon name="sliders" size={17} /><span>{isAllIn ? '全下' : '加注'}</span><Key>R</Key>
      </button>
    </div>
  );
}

/* 加注：宽屏是居中浮层、手机是底部弹层，同一个 Sheet。
   预设 / 步进 / 手输都在这里，底栏只负责打开它。 */
function RaiseSheet({ open, onClose, g, legal, bb, raiseTo, setRaiseTo, onConfirm }) {
  if (!g) return null;
  const total = RiverPoker.pot(g);
  const round = x => Math.round(x / bb) * bb;
  const clampTo = x => Math.max(legal.minTo, Math.min(legal.maxTo, x));
  const presets = [['⅓ 池', 0.33], ['½ 池', 0.5], ['¾ 池', 0.75], ['满池', 1], ['全下', null]]
    .map(([l, f]) => ({ l, to: f === null ? legal.maxTo : clampTo(g.currentBet + round((total + legal.toCall) * f)) }));

  return (
    <Sheet open={open} onClose={onClose} title="加注"
      sub={'底池 ' + money(total) + ' · 需跟注 ' + money(legal.toCall)}
      footer={<>
        <Btn kind="ghost" size="lg" style={{ flex: 1 }} onClick={onClose}>取消</Btn>
        <Btn kind="primary" size="lg" style={{ flex: 2 }} onClick={onConfirm}>加注至 {money(raiseTo)}</Btn>
      </>}>
      <div className="od-rail" style={{ gap: SP.sm + 'px', '--od-rail-pad': '0px' }}>
        {presets.map(o => {
          const on = raiseTo === o.to;
          return (
            <button key={o.l} type="button" onClick={() => setRaiseTo(o.to)}
              style={S(`flex:none;height:${CONTROL.sm.h}px;padding:0 ${CONTROL.sm.px}px;border-radius:${R.md}px;font-size:${CONTROL.sm.fs}px;line-height:1;cursor:pointer;white-space:nowrap;border:1px solid ${on ? '#1d1d1f' : '#e3e3e0'};background:${on ? '#1d1d1f' : '#fff'};color:${on ? '#fff' : '#1d1d1f'};font-weight:${on ? 600 : 400};`)}>
              {o.l}
            </button>
          );
        })}
      </div>

      <div style={S(`display:flex;align-items:center;height:52px;border:1px solid #e3e3e0;background:#fff;border-radius:${R.lg}px;overflow:hidden;`)}>
        <button type="button" aria-label="减少加注额" onClick={() => setRaiseTo(clampTo(raiseTo - bb))}
          style={S('width:48px;height:100%;display:flex;align-items:center;justify-content:center;color:#55555a;cursor:pointer;border:0;background:transparent;padding:0;')}>
          <Icon name="minus" size={18} />
        </button>
        <div style={S('flex:1;text-align:center;font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;')}>{money(raiseTo)}</div>
        <button type="button" aria-label="增加加注额" onClick={() => setRaiseTo(clampTo(raiseTo + bb))}
          style={S('width:48px;height:100%;display:flex;align-items:center;justify-content:center;color:#55555a;cursor:pointer;border:0;background:transparent;padding:0;')}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#86868b;font-variant-numeric:tabular-nums;')}>
        <span>最小 {money(legal.minTo)}</span>
        <span>最大 {money(legal.maxTo)}</span>
      </div>
    </Sheet>
  );
}

function GameScreen({ room, me, g, s, phone, mySeat, legal, raiseTo, setRaiseTo, myTurn, done, winners, onAct, onNext, onRebuy, secLeft, revealed, onReveal }) {
  const [raiseOpen, setRaiseOpen] = React.useState(false);

  const actor = g.toAct >= 0 && !g.done && !g.runout ? g.players[g.toAct] : null;
  const statusText = done ? '' : myTurn
    ? '轮到你 · 需跟注 ' + money(legal.toCall)
    : actor ? '等待 ' + actor.name + ' 行动…' : '发牌中…';

  return (
    <div style={S('flex:1;min-height:0;display:flex;flex-direction:column;')}>
      <TableStage room={room} mode="game" g={g} s={s} revealed={revealed} meSeat={mySeat}
        status={{ text: statusText, sec: done ? null : secLeft }} />

      <ActionBar g={g} legal={legal} myTurn={myTurn} done={done} winners={winners} me={me}
        revealed={revealed} onReveal={onReveal} onAct={onAct} onNext={onNext}
        raiseTo={raiseTo} onOpenRaise={() => setRaiseOpen(true)} phone={phone}  onRebuy={onRebuy}/>

      <RaiseSheet open={raiseOpen} onClose={() => setRaiseOpen(false)} g={g} legal={legal}
        bb={room.bb} raiseTo={raiseTo} setRaiseTo={setRaiseTo}
        onConfirm={() => { setRaiseOpen(false); onAct('raise'); }} />
    </div>
  );
}

/* 宽屏常驻的公屏面板：和抽屉里是同一份内容，只是外面换个壳。 */
function ChatPanel({ code, chat, value, onChange, onSend, onCollapse }) {
  return (
    <Panel side="left" width={288} title="公屏" sub={'房间 ' + code} onCollapse={onCollapse} bare>
      <ChatList chat={chat} />
      <ChatForm value={value} onChange={onChange} onSend={onSend} />
    </Panel>
  );
}

Object.assign(window, { GameScreen, ChatList, ChatForm, ChatPanel, ActionBar, RaiseSheet });
