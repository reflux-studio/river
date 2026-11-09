/* tokens.jsx — 几何常量与断点
 *
 * 颜色、牌面、牌桌的几何全部沿用桌面端：座位环 40% / 36%、下注气泡 25% / 21%、
 * 桌布 inset 13% / 15%、栏杆 12px 都是 app/src/logic.jsx 与 app/src/table.jsx 的原值。
 *
 * 这里有一条明确的原则：不做等比缩放。任何宽度下组件都是桌面端原尺寸，
 * 窄屏靠「收起面板」和「换排布」适配，不靠把整套界面缩小。
 */

const DESK = {
  seatRx: 40,
  seatRy: 36,
  betRx: 25,
  betRy: 21,
  feltInset: { l: 13, r: 13, t: 15, b: 16 },
  rail: 12,
};

/* 断点：1280 以上三栏；1024–1280 收公屏；1024 以下收战绩栏；600 以下才是手机形态。 */
const BP = {
  phone: '(max-width: 599px)',
  narrow: '(max-width: 1023px)',
  mid: '(max-width: 1279px)',
};

/* ---------- 标度 ----------
 * 桌面端的 tokens.jsx 只给了颜色。间距、圆角、字号、控件高度、阴影在这里补齐，
 * 所有组件只能从这几个阶梯里取值，不允许再手挑数字。
 *
 * 间距 4 的倍数；控件高度只有三档，同一行里的控件必须同高。
 */
const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
const R = { xs: 4, sm: 6, md: 8, lg: 10, xl: 12, xxl: 16, pill: 999 };
const FS = { xs: 11, sm: 12, md: 13, base: 14, lg: 15, xl: 16, xxl: 18, h: 24, title: 28 };

/* 控件高度三档。这一条是硬的：声明值必须等于渲染值。
 *
 * 上一版的错误是按钮用「上下 padding + line-height 1.4」把盒子撑出来：
 * 13px 字号算下来是 7+7+18.2 = 32.2px，而标度写的是 30px；
 * 15px 主按钮算下来 45px，标度写 44px。于是同一行里输入框 39.6、按钮 32.2、
 * 分段控件 34.2、预设片 30，四种高度并排，看着就是「间距没处理」。
 *
 * 现在的写法：高度写死，上下不写 padding，只留左右内边距；文字靠 flex 居中。
 * 同一行里的控件选同一档，高度就天然相等，不需要谁去补 padding。 */
const H = { sm: 30, md: 36, lg: 44 };

/* 每一档的完整规格。按钮、输入框、分段控件、开关都从这里取值。 */
const CONTROL = {
  sm: { h: H.sm, px: 14, fs: FS.md },   /* 次级按钮、分段控件、预设片 */
  md: { h: H.md, px: 16, fs: FS.base }, /* 输入框、需要成排的表单按钮 */
  lg: { h: H.lg, px: 26, fs: FS.lg },   /* 主操作：开始牌局、创建房间、下一手 */
};
const SH = {
  e1: '0 1px 2px rgba(0,0,0,0.08)',
  e2: '0 4px 14px rgba(0,0,0,0.10)',
  e3: '0 16px 40px rgba(0,0,0,0.16)',
};
const LINE = { thin: '1px solid #ebebe9', control: '1px solid #e3e3e0' };


function useMQ(query) {
  const [on, setOn] = React.useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  React.useEffect(() => {
    const m = window.matchMedia(query);
    const h = e => setOn(e.matches);
    setOn(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [query]);
  return on;
}

/* 恒等缩放：保留 s.q / s.px 的调用点，但不再乘任何系数。 */
function scaleOf() {
  return { k: 1, px: n => Math.round(n) + 'px', q: n => Math.round(n) };
}

/* 座位环：圆角矩形轮廓，座位按弧长均分。
 *
 * 为什么不用椭圆：椭圆在长轴两端收得急，人一多，两侧的座位就在切点附近挤成一堆。
 * 圆角矩形有四条直边，按弧长均分之后每个座位的间距相等——这就是把曲率调小的实际效果。
 *
 * 轮廓从底边中点开始顺时针走一圈；座位号 base 落在底边中点（也就是「我」的位置）。
 */
function ringOutline(a, b, r) {
  const pts = [];
  const push = (x, y) => pts.push({ x, y });
  const line = (x0, y0, x1, y1, n) => {
    for (let i = 1; i <= n; i++) push(x0 + (x1 - x0) * (i / n), y0 + (y1 - y0) * (i / n));
  };
  const arc = (cx, cy, from, to, n) => {
    for (let i = 1; i <= n; i++) {
      const t = from + (to - from) * (i / n);
      push(cx + r * Math.cos(t), cy + r * Math.sin(t));
    }
  };
  push(0, b);
  line(0, b, a - r, b, 4);
  arc(a - r, b - r, Math.PI / 2, 0, 6);
  line(a, b - r, a, -(b - r), 6);
  arc(a - r, -(b - r), 0, -Math.PI / 2, 6);
  line(a - r, -b, -(a - r), -b, 8);
  arc(-(a - r), -(b - r), -Math.PI / 2, -Math.PI, 6);
  line(-a, -(b - r), -a, b - r, 6);
  arc(-(a - r), b - r, Math.PI, Math.PI / 2, 6);
  line(-(a - r), b, 0, b, 4);
  return pts;
}

/* 由舞台实测尺寸算出一条座位环：a / b 是半宽半高，r 是圆角半径，座位再大也不会出界。 */
function makeRing(box, size) {
  if (!box || !box.w || !box.h) return null;
  const a = Math.max(48, Math.min(box.w * 0.44, box.w / 2 - size.w / 2 - 4));
  const b = Math.max(48, Math.min(box.h * 0.42, box.h / 2 - size.h / 2 - 4));
  const r = Math.max(14, Math.min(a, b) * 0.42);
  const pts = ringOutline(a, b, r);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, total, cx: box.w / 2, cy: box.h / 2, a, b, r };
}

/* 沿环走 d 距离的落点（绝对坐标）。 */
function ringPoint(ring, d) {
  if (!ring) return null;
  let acc = 0;
  for (let i = 1; i < ring.pts.length; i++) {
    const p0 = ring.pts[i - 1], p1 = ring.pts[i];
    const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (acc + seg >= d) {
      const t = seg ? (d - acc) / seg : 0;
      return { x: ring.cx + p0.x + (p1.x - p0.x) * t, y: ring.cy + p0.y + (p1.y - p0.y) * t };
    }
    acc += seg;
  }
  const last = ring.pts[ring.pts.length - 1];
  return { x: ring.cx + last.x, y: ring.cy + last.y };
}

/* 第 no 号座位的落点：按弧长均分，base（我的座位号）固定在底边中点。 */
function ringSeat(ring, no, count, base) {
  if (!ring || !count) return null;
  const t = (((no - (base || 0)) % count) + count) % count;
  return ringPoint(ring, (t / count) * ring.total);
}

/* 输入框里可能是空串或半截数字，统一折成不小于 lo 的整数 */
function toInt(v, fallback, lo) {
  const n = Math.round(Number(v));
  const base = Number.isFinite(n) ? n : fallback;
  return Math.max(lo == null ? 1 : lo, base);
}

function money(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

/* 0 与正负分开说，不把持平写成增长。 */
function delta(n) {
  const v = Math.round(n || 0);
  if (v > 0) return { text: '+' + money(v), color: 'oklch(0.55 0.14 155)' };
  if (v < 0) return { text: '−' + money(Math.abs(v)), color: 'oklch(0.56 0.2 25)' };
  return { text: '±0', color: '#86868b' };
}

Object.assign(window, { DESK, BP, SP, R, FS, H, CONTROL, SH, LINE, useMQ, scaleOf, makeRing, ringPoint, ringSeat, money, delta });
