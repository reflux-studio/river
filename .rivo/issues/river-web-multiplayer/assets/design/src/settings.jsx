/* settings.jsx — 房主专属的房间设置
 *
 * 只有房主从这个入口进来；普通玩家在房间面板里看到的是同一段规则的只读版本。
 * 亮牌不在这里——那是每个玩家摊牌时自己决定的。
 *
 * 依赖：app/src/tokens.jsx、tokens.jsx、ui.jsx
 */

const ACTION_OPTS = [
  { value: 20, label: '20 秒' },
  { value: 30, label: '30 秒' },
  { value: 45, label: '45 秒' },
];
const SHOW_OPTS = [
  { value: 6, label: '6 秒' },
  { value: 10, label: '10 秒' },
  { value: 15, label: '15 秒' },
];

function SettingsSheet({ open, onClose, room, onSave, live, phone }) {
  const [draft, setDraft] = React.useState(null);

  React.useEffect(() => {
    if (!open) return;
    setDraft({
      sb: room.sb,
      bb: room.bb,
      actionSec: room.actionSec,
      showSec: room.showSec,
      spectate: room.spectate,
    });
  }, [open]);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const save = () => {
    if (!draft) return;
    const sbV = toInt(draft.sb, room.sb, 1);
    const bbV = Math.max(toInt(draft.bb, room.bb, 1), sbV);
    onSave({ sb: sbV, bb: bbV, actionSec: draft.actionSec, showSec: draft.showSec, spectate: draft.spectate });
  };

  return (
    <Sheet open={open} onClose={onClose} title="房间设置" sub="只有房主能改，普通玩家看到的是只读版本。"
      footer={<>
        <Btn kind="ghost" onClick={onClose} style={{ flex: 1 }}>取消</Btn>
        <Btn kind="primary" onClick={save} style={{ flex: 1 }}>保存设置</Btn>
      </>}>
      {draft ? (
        <>
          <Note tone={live ? 'warn' : undefined}>
            {live
              ? '牌局正在进行，改动从下一手生效；本手的座位归属和盲注不变。'
              : '牌局还没开始，改动立即生效。'}
          </Note>

          <div style={S('display:flex;flex-direction:column;')}>
            {/* 手机上分段控件换成整宽三格，不再让标签和它挤在一行里 */}
            <Row label="盲注" hint="大盲通常是小盲的 2 倍">
              <div style={S(`display:flex;align-items:center;gap:${SP.sm}px;`)}>
                <NumField label="小盲" value={draft.sb} onChange={v => set('sb', v)} min={1} suffix="小盲" />
                <span style={S(`font-size:${FS.md}px;color:#a1a1a6;`)}>/</span>
                <NumField label="大盲" value={draft.bb} onChange={v => set('bb', v)} min={1} suffix="大盲" />
              </div>
            </Row>
            <Row label="行动时限" hint="超时可过则过，否则弃牌">
              <Seg block={!!phone} label="行动时限" value={draft.actionSec} onChange={v => set('actionSec', v)} options={ACTION_OPTS} />
            </Row>
            <Row label="展示时限" hint="摊牌后牌面停留的时间">
              <Seg block={!!phone} label="展示时限" value={draft.showSec} onChange={v => set('showSec', v)} options={SHOW_OPTS} />
            </Row>
            <Row label="允许观战" hint="关闭后满员时不能再进来旁观" inline last>
              <Switch checked={draft.spectate} onChange={v => set('spectate', v)} label="允许观战" />
            </Row>
          </div>

          <Note>亮牌由每个玩家在摊牌时自己决定，不放在房间设置里。座位数在建房时确定，之后不改。</Note>
        </>
      ) : null}
    </Sheet>
  );
}

Object.assign(window, { SettingsSheet });
