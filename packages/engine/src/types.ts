export type Card = string
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
export type HandCat =
  | 'highCard' | 'pair' | 'twoPair' | 'trips' | 'straight' | 'flush' | 'fullHouse' | 'quads' | 'straightFlush' | 'royalFlush'
  | 'pocketPair' | 'suitedHole'
