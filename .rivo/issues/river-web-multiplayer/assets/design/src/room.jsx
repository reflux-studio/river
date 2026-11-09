/* room.jsx — 房间与房间抽屉
 *
 * 房间号、邀请链接、成员、本场盈亏、房主操作、教练、退出——全部收在同一个抽屉里。
 * 宽屏是右侧抽屉，手机是底部弹层（同一个 Drawer 组件）。牌桌旁边不再挂常驻侧栏，
 * 也不再和「战绩」分成两个入口：战绩就是成员列表里的筹码与本场盈亏。
 *
 * 依赖：app/src/tokens.jsx、tokens.jsx、ui.jsx、felt.jsx
 */

/* 邀请：房间号 + 复制链接 */
function InviteCard({ room, onCopy, copyState }) {
  return (
    <div style={S(`background:#f7f7f5;border:1px solid #ebebe9;border-radius:${R.xl}px;padding:${SP.md}px;display:flex;flex-direction:column;gap:${SP.sm}px;`)}>
      <span style={S(`font-size:${FS.xs}px;color:#86868b;font-weight:600;letter-spacing:0.04em;`)}>房间号</span>
      <span style={S('font-family:ui-monospace,Menlo,monospace;font-size:24px;font-weight:600;letter-spacing:0.16em;line-height:1.1;user-select:all;')}>{room.code}</span>
      <span style={S(`font-size:${FS.sm}px;color:#86868b;line-height:1.5;`)}>把房间号或链接发给朋友，他们打开就能选座。</span>
      <div>
        <Btn kind="ghost" size="sm" onClick={onCopy}>
          <Icon name="copy" size={16} />
          {copyState === 'ok' ? '已复制' : copyState === 'fail' ? '复制失败，手动选房间号' : '复制邀请链接'}
        </Btn>
      </div>
    </div>
  );
}

/* 成员一行：座位号 / 头像 / 名字 / 筹码 + 本场盈亏。管理入口只有房主看得到。 */
function PlayerRow({ room, me, g, seatNo, isOwner, onManage }) {
  const p = room.players[room.seats[seatNo]];
  if (!p) return null;
  const gp = g ? g.players.find(x => x.seatNo === seatNo) : null;
  const chips = gp ? gp.stack : p.chips;
  const d = delta(chips - (p.boughtIn || 0));
  const isMe = p.id === me.id;
  return (
    <div className="row-hover" style={S(`display:flex;align-items:center;gap:${SP.md}px;padding:${SP.sm}px 0;`)}>
      <span style={S('font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#a1a1a6;width:18px;text-align:right;flex:none;')}>{seatNo + 1}</span>
      <Avatar hue={p.hue} size={30} dim={p.offline}>{p.ini}</Avatar>
      <div style={S('display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;')}>
        <div style={S('display:flex;align-items:center;gap:6px;min-width:0;')}>
          <span style={S('font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{p.name}{isMe && p.name !== '你' ? '（你）' : ''}</span>
          {p.isOwner ? <Tag tone="owner">房主</Tag> : null}
          {p.offline ? <Tag tone="off">掉线</Tag> : null}
        </div>
        <div style={S('display:flex;align-items:center;gap:8px;font-size:12px;font-variant-numeric:tabular-nums;')}>
          <span style={S('color:#86868b;')}>{money(chips)}</span>
          <span style={S('color:' + d.color + ';font-weight:600;')}>{d.text}</span>
        </div>
      </div>
      {isOwner && !isMe ? (
        <Btn kind="quiet" size="sm" onClick={() => onManage(p.id)}>管理</Btn>
      ) : null}
    </div>
  );
}

/* 房间的内容：公共部分 + 房主额外部分。宽屏塞进常驻面板，窄屏塞进抽屉，同一份。 */
function RoomBody({ room, me, g, seated, inGame, isOwner, paused, coachOn, copyState,
  onCopy, onStart, onPause, onOpenSettings, onManage, onCoach }) {
  const list = [];
  room.seats.forEach((pid, no) => { if (pid) list.push(no); });

  return (
    <>
      <InviteCard room={room} onCopy={onCopy} copyState={copyState} />

      <div style={S('display:flex;flex-direction:column;gap:2px;')}>
        <span style={S(`font-size:${FS.xs}px;color:#86868b;font-weight:600;letter-spacing:0.04em;padding-bottom:${SP.xs}px;`)}>
          已入座 {list.length} / {room.seatCount} · 盲注 {room.sb}/{room.bb}
        </span>
        {list.map(no => (
          <PlayerRow key={no} room={room} me={me} g={g} seatNo={no} isOwner={isOwner} onManage={onManage} />
        ))}
        <p style={S(`font-size:${FS.sm}px;color:#a1a1a6;line-height:1.6;padding-top:${SP.sm}px;`)}>
          盈亏按各自买入计算，所有人可见。
        </p>
      </div>

      {isOwner ? (
        <div style={S('display:flex;flex-direction:column;gap:8px;')}>
          <span style={S(`font-size:${FS.xs}px;color:#86868b;font-weight:600;letter-spacing:0.04em;`)}>房主</span>
          <div style={S('display:flex;gap:8px;flex-wrap:wrap;')}>
            {!inGame ? (
              <Btn kind="primary" size="sm" disabled={seated < 2} onClick={onStart}>
                <Icon name="play" size={16} />{seated < 2 ? '还差 ' + (2 - seated) + ' 人' : '开始牌局'}
              </Btn>
            ) : (
              <Btn kind="ghost" size="sm" onClick={onPause}>
                <Icon name={paused ? 'play' : 'pause'} size={16} />{paused ? '继续牌局' : '暂停牌局'}
              </Btn>
            )}
            <Btn kind="ghost" size="sm" onClick={onOpenSettings}>
              <Icon name="settings" size={16} />房间设置
            </Btn>
          </div>
          <span style={S(`font-size:${FS.sm}px;color:#86868b;line-height:1.5;`)}>
            暂停会冻结所有人的行动计时，聊天和连接照常。
          </span>
        </div>
      ) : (
        <Note>{inGame ? (paused ? '房主暂停了牌局，计时已冻结。' : '只有房主能暂停牌局和改设置。') : '等房主开始牌局。'}</Note>
      )}

      <div className="form-row form-row--inline" style={{ padding: 0 }}>
        <span className="form-row__label">教练</span>
        <span className="form-row__hint">只读你自己的视图，在你这台设备上运行，不暂停牌局。</span>
        <div className="form-row__control">
          <Switch checked={coachOn} onChange={onCoach} label="开启教练" />
        </div>
      </div>

      {coachOn ? (
        <Note>（本地提示示例）当前底池 120，跟注 40，需要约 25% 胜率。你手上是同花听牌，出路 9 张，后面还有两张可以看。</Note>
      ) : null}
    </>
  );
}

/* 房间页：牌桌 + 一句话提示。房间本身的操作都在右上角的抽屉里。 */
function RoomScreen({ room, me, s, onPick, isOwner }) {
  const seated = room.seats.filter(Boolean).length;
  const mySeat = room.seats.indexOf(me.id);

  let tip;
  if (mySeat < 0) tip = '点空位坐下，选好位置就能开局。';
  else if (isOwner) tip = seated < 2 ? '还差一位朋友就可以开局。' : '人到了就点「开始牌局」，不用等人齐。';
  else tip = '已经坐好，等房主开始牌局。';

  return (
    <div style={S('flex:1;min-height:0;display:flex;flex-direction:column;')}>
      <div style={S('flex:none;padding:8px 16px;background:oklch(0.96 0.03 72);color:oklch(0.42 0.08 72);font-size:12px;line-height:1.5;text-align:center;border-bottom:1px solid oklch(0.89 0.05 72);')}>{tip}</div>
      <TableStage room={room} mode="room" s={s} meSeat={mySeat < 0 ? null : mySeat} onPick={onPick} />
    </div>
  );
}

Object.assign(window, { RoomScreen, RoomBody, InviteCard, PlayerRow });
