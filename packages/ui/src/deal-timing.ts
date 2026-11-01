// 底牌发放的视觉与声音共用节奏；本模块不依赖 React。
export const DEAL_CARD_INTERVAL_MS = 170
export const DEAL_CARD_DURATION_MS = 500
// 声音相对"这张牌开始飞行"的额外延后。样本开头的静音已在解码时跳过，
// 0 表示起音与起飞同时；想更贴近落桌再调大。
export const DEAL_SOUND_OFFSET_MS = 0
