/* ui.jsx — 基础件
 *
 * 这一层的唯一职责：把 tokens.jsx 的标度翻译成具体样式。
 * 所有间距、圆角、字号、控件高度、阴影都从 SP / R / FS / H / SH 取值，
 * 组件里不允许再出现手挑的数字——上一版就是因为每处手挑，才出现了 38 种 padding。
 *
 * 控件高度只有三档（30 / 36 / 44）。同一行里的控件必须同高，
 * 需要一行里放按钮和分段控件时，用 size 对齐，不要各自写 padding。
 *
 * 依赖：app/src/tokens.jsx（S / TOKENS）、tokens.jsx
 */

/* 按钮几何取自桌面端实测值（主按钮 12×26 / 15px，次按钮 7×14 / 13px），
 * 但换算成 CONTROL 的「高度 + 左右内边距」，不再用上下 padding 撑盒子：
 *
 *   size  高度  左内边距  字号    对应桌面端
 *   sm     30     14      13      7×14 / 13px（行高 normal 时正好 30）
 *   md     36     16      14      成排表单用，和输入框同高
 *   lg     44     26      15      12×26 / 15px（桌面端渲染 42，这里留 2px 触控余量）
 *
 * 同一行里的控件必须选同一档，高度天然相等；不要用 padding 去"补"高度。
 * 上下 padding 恒为 0，垂直方向交给 flex 居中，行高恒为 1。 */
const BTN_SIZE = {
  sm: `height:${CONTROL.sm.h}px;padding:0 ${CONTROL.sm.px}px;font-size:${CONTROL.sm.fs}px;`,
  md: `height:${CONTROL.md.h}px;padding:0 ${CONTROL.md.px}px;font-size:${CONTROL.md.fs}px;`,
  lg: `height:${CONTROL.lg.h}px;padding:0 ${CONTROL.lg.px}px;font-size:${CONTROL.lg.fs}px;`,
};

const BTN_KIND = {
  /* 主按钮无描边：桌面端实测 border 为 0，多一圈 1px 会让黑胶囊边缘发虚、高度也高 2px */
  primary: 'background:#1d1d1f;color:#fff;border:0;font-weight:500;',
  ghost: 'background:transparent;color:#1d1d1f;border:1px solid #e3e3e0;',
  quiet: 'background:transparent;color:#86868b;border:1px solid transparent;',
  danger: 'background:transparent;color:oklch(0.56 0.2 25);border:1px solid #e3e3e0;',
};

/* 默认取 sm：桌面端面板里的次级按钮（编辑 / 添加提供方 / 规则介绍）都是 13px 胶囊 */
function Btn({ kind = 'ghost', size = 'sm', block, style, children, ...rest }) {
  const box = BTN_SIZE[size] || BTN_SIZE.sm;
  const layout = block ? 'display:flex;width:100%;' : 'display:inline-flex;';
  const base = layout + `align-items:center;justify-content:center;gap:${SP.sm}px;white-space:nowrap;flex-shrink:0;`
    + 'border-radius:999px;line-height:1;';
  return (
    <button type="button" className={'k-btn k-btn--' + kind}
      style={{ ...S(base + box + BTN_KIND[kind]), ...(style || null) }} {...rest}>
      {children}
    </button>
  );
}

function Avatar({ hue = 200, size = 32, font, dim, children, style }) {
  const bg = `oklch(0.92 0.05 ${hue})`;
  const f = font || Math.round(size * 0.42);
  return (
    <div style={{ ...S(`width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:${f}px;font-weight:600;flex-shrink:0;${dim ? 'filter:grayscale(1);opacity:.6;' : ''}`), ...(style || null) }}>
      {children}
    </div>
  );
}

/* 数字输入：胶囊外框 + 无边框输入 + 可选后缀，高度与 md 档输入框一致。
 * 小盲 / 大盲 / 买入都用它，避免再出现「这排控件不是同一个高度」。 */
function NumField({ value, onChange, min, max, step = 1, suffix, width = 108, label, phone }) {
  const w = phone ? '100%' : width + 'px';
  return (
    <div style={S(`display:flex;align-items:center;gap:${SP.xs}px;height:${CONTROL.md.h}px;box-sizing:border-box;padding:0 ${SP.md}px;border:1px solid #e3e3e0;border-radius:${R.lg}px;background:#fff;width:${w};min-width:0;`)}>
      <input type="number" inputMode="numeric" value={value} min={min} max={max} step={step} aria-label={label}
        onChange={e => onChange(e.target.value)}
        style={S(`width:100%;min-width:0;border:0;outline:none;background:transparent;font-size:${CONTROL.md.fs}px;font-family:inherit;color:#1d1d1f;font-variant-numeric:tabular-nums;`)} />
      {suffix ? <span style={S(`font-size:${FS.sm}px;color:#a1a1a6;flex:none;`)}>{suffix}</span> : null}
    </div>
  );
}

/* 分段控件：外层高度 = sm 档控件高度，内片 = 外层减两侧 3px 内边距，正好 24。
 * 这样它和同排的 sm 按钮、预设片一样高，不再各算各的。 */
function Seg({ options, value, onChange, label, block }) {
  const tabH = CONTROL.sm.h - 6;
  return (
    <div role="radiogroup" aria-label={label}
      style={S(`display:flex;align-items:center;gap:2px;height:${CONTROL.sm.h}px;padding:3px;background:#f1f1ef;border-radius:9px;${block ? 'width:100%;' : ''}`)}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(o.value)}
            style={S(`flex:${block ? '1' : '0 0 auto'};height:${tabH}px;padding:0 ${SP.md}px;border:0;border-radius:7px;font-size:${FS.md}px;line-height:1;cursor:pointer;white-space:nowrap;background:${on ? '#fff' : 'transparent'};box-shadow:${on ? SH.e1 : 'none'};font-weight:${on ? 600 : 400};color:${on ? '#1d1d1f' : '#55555a'};`)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label}
      onClick={() => onChange(!checked)}
      style={S(`width:36px;height:20px;border-radius:${R.pill}px;background:${checked ? '#1d1d1f' : '#dcdcd8'};position:relative;cursor:pointer;flex-shrink:0;border:0;padding:0;transition:background 150ms;`)}>
      <div style={S(`position:absolute;top:2px;left:${checked ? '18px' : '2px'};width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:${SH.e1};transition:left 150ms cubic-bezier(.2,.8,.3,1);`)} />
    </button>
  );
}

function Tag({ children, tone }) {
  const map = {
    owner: 'background:oklch(0.96 0.03 72);color:oklch(0.44 0.1 72);border:1px solid oklch(0.89 0.05 72);',
    off: 'background:oklch(0.965 0.018 25);color:oklch(0.56 0.2 25);border:1px solid transparent;',
    plain: 'background:#f1f1ef;color:#6e6e73;border:1px solid transparent;',
  };
  return <span style={S(`font-size:${FS.xs}px;font-weight:600;line-height:1;padding:${SP.xs}px ${SP.sm}px;border-radius:${R.xs}px;white-space:nowrap;` + (map[tone] || map.plain))}>{children}</span>;
}

/* 弹层：原生 dialog。头部/主体/底部的内边距都走同一档。 */
function Sheet({ open, onClose, title, sub, children, footer }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="k-sheet" onClose={onClose}
      onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
      <div className="k-sheet__card">
        <div style={S(`display:flex;align-items:flex-start;gap:${SP.md}px;padding:${SP.lg}px ${SP.lg}px ${SP.md}px;border-bottom:1px solid #f0f0ee;flex-shrink:0;`)}>
          <div style={S(`display:flex;flex-direction:column;gap:${SP.xs}px;flex:1;min-width:0;`)}>
            <h2 style={S(`font-size:${FS.xl}px;font-weight:600;line-height:1.3;`)}>{title}</h2>
            {sub ? <p style={S(`font-size:${FS.sm}px;color:#86868b;line-height:1.5;`)}>{sub}</p> : null}
          </div>
          <button type="button" aria-label="关闭" onClick={() => ref.current && ref.current.close()}
            style={S(`width:${H.sm}px;height:${H.sm}px;border-radius:${R.md}px;border:0;background:transparent;color:#86868b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;`)}>
            <svg className="od-icon" viewBox="0 0 24 24" style={{ '--od-icon-size': FS.xl + 'px' }} aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
        <div style={S(`flex:1;min-height:0;overflow-y:auto;padding:${SP.lg}px;display:flex;flex-direction:column;gap:${SP.lg}px;`)}>{children}</div>
        {footer ? <div style={S(`flex-shrink:0;padding:${SP.md}px ${SP.lg}px calc(${SP.md}px + var(--safe-b));border-top:1px solid #f0f0ee;display:flex;gap:${SP.sm}px;`)}>{footer}</div> : null}
      </div>
    </dialog>
  );
}

/* 设置行：一行最多两个元素。
 * 桌面 / 平板：[标签] … [控件]，备注占下一行整宽；
 * 手机：标签 → 控件（整宽）→ 备注，竖排。
 * inline 只给开关这类小控件用，手机上保留「左标签 / 右控件」。 */
function Row({ label, hint, children, last, inline }) {
  return (
    <div className={'form-row' + (inline ? ' form-row--inline' : '')}
      style={{ padding: `${SP.md}px 0`, borderBottom: last ? 'none' : '1px solid #f3f3f1' }}>
      <span className="form-row__label">{label}</span>
      {hint ? <span className="form-row__hint">{hint}</span> : null}
      <div className="form-row__control">{children}</div>
    </div>
  );
}

function Note({ children, tone }) {
  const bg = tone === 'warn' ? 'oklch(0.97 0.02 72)' : '#f7f7f5';
  const color = tone === 'warn' ? 'oklch(0.45 0.09 72)' : '#55555a';
  return <p style={S(`font-size:${FS.sm}px;line-height:1.6;color:${color};background:${bg};border-radius:${R.lg}px;padding:${SP.sm}px ${SP.md}px;`)}>{children}</p>;
}

/* 面板标题：左标题 + 右操作，内边距统一 */
function PanelHead({ title, sub, action, onCollapse }) {
  return (
    <div style={S(`flex-shrink:0;display:flex;align-items:flex-start;gap:${SP.sm}px;padding:${SP.lg}px ${SP.lg}px ${SP.md}px;border-bottom:1px solid #f0f0ee;`)}>
      <div style={S(`display:flex;flex-direction:column;gap:${SP.xs}px;flex:1;min-width:0;`)}>
        <span style={S(`font-size:${FS.lg}px;font-weight:600;`)}>{title}</span>
        {sub ? <span style={S(`font-size:${FS.sm}px;color:#86868b;`)}>{sub}</span> : null}
      </div>
      {action || null}
      {onCollapse ? (
        <button type="button" onClick={onCollapse} aria-label="收起面板"
          style={S(`border:0;background:transparent;font-size:${FS.sm}px;color:#86868b;cursor:pointer;padding:${SP.xs}px ${SP.sm}px;border-radius:${R.sm}px;white-space:nowrap;flex-shrink:0;`)}>收起</button>
      ) : null}
    </div>
  );
}

/* 抽屉：桌面端贴边滑出（公屏在左、房间在右），手机上仍然是从底部升起的一片。
   和 Sheet 用同一套原生 dialog 行为：点遮罩、按 Esc、点关闭都能回退。 */
function Drawer({ open, onClose, side = 'right', title, sub, children, footer, bare }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={'k-drawer k-drawer--' + side} onClose={onClose}
      onClick={e => { if (e.target === ref.current) ref.current.close(); }}>
      <div className="k-drawer__card">
        <div className="k-drawer__head">
          <div style={S('display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;')}>
            <span style={S(`font-size:${FS.xl}px;font-weight:600;`)}>{title}</span>
            {sub ? <span style={S(`font-size:${FS.sm}px;color:#86868b;`)}>{sub}</span> : null}
          </div>
          <button type="button" aria-label="关闭" onClick={() => ref.current && ref.current.close()}
            style={S(`width:${H.sm}px;height:${H.sm}px;border-radius:${R.md}px;border:0;background:transparent;color:#86868b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;`)}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="k-drawer__body" style={bare ? { overflow: 'hidden', padding: 0, gap: 0 } : null}>{children}</div>
        {footer ? <div className="k-drawer__foot">{footer}</div> : null}
      </div>
    </dialog>
  );
}

/* 常驻面板：宽屏用，和抽屉里装的是同一份内容。
   桌面有屏效，信息就该一直在——牌桌让出宽度，而不是把所有东西塞进按钮里。 */
function Panel({ side = 'right', width = 320, title, sub, onCollapse, children, footer, bare }) {
  return (
    <aside style={S(`width:${width}px;flex:none;background:#fff;display:flex;flex-direction:column;min-height:0;`
      + (side === 'left' ? 'border-right:1px solid #ebebe9;' : 'border-left:1px solid #ebebe9;'))}>
      <div style={S('flex:none;display:flex;align-items:flex-start;gap:8px;padding:12px 16px;border-bottom:1px solid #f0f0ee;')}>
        <div style={S('display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;')}>
          <span style={S(`font-size:${FS.lg}px;font-weight:600;`)}>{title}</span>
          {sub ? <span style={S(`font-size:${FS.sm}px;color:#86868b;`)}>{sub}</span> : null}
        </div>
        {onCollapse ? (
          <button type="button" onClick={onCollapse} aria-label="收起面板"
            style={S(`width:${H.sm}px;height:${H.sm}px;border:0;border-radius:${R.md}px;background:transparent;color:#86868b;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;`)}>
            <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={16} />
          </button>
        ) : null}
      </div>
      <div style={S('flex:1;min-height:0;display:flex;flex-direction:column;' + (bare ? '' : 'overflow-y:auto;padding:16px;gap:16px;'))}>
        {children}
      </div>
      {footer ? <div style={S('flex:none;padding:12px 16px calc(12px + var(--safe-b));border-top:1px solid #f0f0ee;')}>{footer}</div> : null}
    </aside>
  );
}

/* 一套线性图标：24 viewBox、1.8 描边、圆头端点。
   全站只有这一套，尺寸走 .od-icon 的 --od-icon-size，不在别处单独画 SVG。 */
const ICON_D = {
  chat: 'M20 11.6a7.6 7.6 0 0 1-11 6.9l-4.4 1.3 1.2-4a7.6 7.6 0 1 1 14.2-4.2z',
  user: 'M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 19.6c0-2.9 3.1-4.8 7-4.8s7 1.9 7 4.8',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.6 19.4c0-2.6 2.4-4.6 5.4-4.6s5.4 2 5.4 4.6M16 5.6a3 3 0 0 1 0 5.6M17.6 14.9c1.6.7 2.8 2.1 2.8 4',
  close: 'M6 6l12 12M18 6L6 18',
  copy: 'M9.5 9.5h8.5a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1V10.5a1 1 0 0 1 1-1zM15 6.5v-1a1 1 0 0 0-1-1H5.5a1 1 0 0 0-1 1V14a1 1 0 0 0 1 1h1',
  settings: 'M4.5 7h15M4.5 12h15M4.5 17h15M9 4.8v4.4M15.5 9.8v4.4M8.5 14.8v4.4',
  pause: 'M9.5 5v14M14.5 5v14',
  play: 'M8 5.2l10.2 6.8L8 18.8z',
  flag: 'M6 4.2v15.6M6 5.2h10.8l-2.4 4.4 2.4 4.4H6z',
  chip: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8zM12 7.9a4.1 4.1 0 1 0 0 8.2 4.1 4.1 0 0 0 0-8.2z',
  sliders: 'M4 8h5M13 8h7M4 16h9M17 16h3M11 6v4M15 14v4',
  check: 'M5.5 12.6l4.2 4.2L19 7.4',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
};

function Icon({ name, size = 18 }) {
  const d = ICON_D[name];
  if (!d) return null;
  return (
    <svg className="od-icon" viewBox="0 0 24 24" style={{ '--od-icon-size': size + 'px' }} aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 快捷键键帽。手机上 CSS 直接隐藏，桌面端挂在按钮里。 */
function Key({ children }) {
  return <span className="k-key" aria-hidden="true">{children}</span>;
}

Object.assign(window, { Btn, Avatar, Seg, Switch, Tag, Sheet, Drawer, Panel, Icon, Key, Row, Note, PanelHead, NumField, BTN_SIZE });
