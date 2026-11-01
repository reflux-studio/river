import { createTableAudio } from './audio-controller'

// Literal URLs let Vite include every sound in the offline desktop bundle.
export const audio = createTableAudio({
  urls: {
    slide: new URL('../assets/sounds/card-slide-1.ogg', import.meta.url).href,
    place1: new URL('../assets/sounds/card-place-1.ogg', import.meta.url).href,
    place2: new URL('../assets/sounds/card-place-2.ogg', import.meta.url).href,
    lay1: new URL('../assets/sounds/chip-lay-1.ogg', import.meta.url).href,
    lay2: new URL('../assets/sounds/chip-lay-2.ogg', import.meta.url).href,
    handle: new URL('../assets/sounds/chips-handle-1.ogg', import.meta.url).href,
    allin: new URL('../assets/sounds/chips-handle-5.ogg', import.meta.url).href,
    collide: new URL('../assets/sounds/chips-collide-1.ogg', import.meta.url).href,
    fold: new URL('../assets/sounds/card-shove-1.ogg', import.meta.url).href,
    stack: new URL('../assets/sounds/chips-stack-1.ogg', import.meta.url).href,
    knock1: new URL('../assets/sounds/impactWood_light_000.ogg', import.meta.url).href,
    knock2: new URL('../assets/sounds/impactWood_light_002.ogg', import.meta.url).href
  },
  // Kenney 的样本开头带几十到一百多毫秒静音（card-slide 是 131ms），
  // 播放时从这里开始，否则每次发声都比动作晚一截。素材替换后重跑 scripts/audio-onsets.cjs。
  onsets: {
    slide: 0.131,
    place1: 0.095,
    place2: 0.038,
    lay1: 0.042,
    lay2: 0.074,
    handle: 0.037,
    allin: 0,
    collide: 0.077,
    fold: 0.045,
    stack: 0.077,
    knock1: 0,
    knock2: 0
  }
})
