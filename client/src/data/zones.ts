/* eslint-disable */

export interface ZoneInfo {
  key:      string
  name:     string
  monster:  string
  expMin:   number
  expMax:   number
  minLevel: number
  icon:     string
}

export interface CityInfo {
  key:      string
  name:     string
  minLevel: number | null
  zones:    ZoneInfo[]
}

export const CITIES: CityInfo[] = [
  {
    key: 'venore',
    name: 'Venore',
    minLevel: null,
    zones: [
      { key: 'venore_bat_cave',        name: 'Bat Cave',        monster: 'Bat',            expMin: 10,  expMax: 10,  minLevel: 1,  icon: '🦇' },
      { key: 'venore_elf_cave',        name: 'Elf Cave',        monster: 'Elf Arcanist',   expMin: 10,  expMax: 175, minLevel: 10, icon: '🌲' },
      { key: 'venore_amazon_tower',    name: 'Amazon Tower',    monster: 'Witch',          expMin: 60,  expMax: 120, minLevel: 20, icon: '🏰' },
      { key: 'venore_rotworm_caves',   name: 'Rotworm Caves',   monster: 'Rotworm Queen',  expMin: 40,  expMax: 75,  minLevel: 30, icon: '🕳️' },
      { key: 'venore_chakoya_iceberg', name: 'Chakoya Iceberg', monster: 'Frost Giantess', expMin: 28,  expMax: 150, minLevel: 40, icon: '❄️' },
    ],
  },
  { key: 'rookgaard', name: 'Rookgaard',   minLevel: null, zones: [] },
  { key: 'carlin',    name: 'Carlin',      minLevel: null, zones: [] },
  { key: 'thais',     name: 'Thais',       minLevel: null, zones: [] },
  { key: 'kazordoon', name: 'Kazordoon',   minLevel: null, zones: [] },
  { key: 'abdendriel',name: "Ab'Dendriel", minLevel: null, zones: [] },
  { key: 'porthope',  name: 'Port Hope',   minLevel: null, zones: [] },
  { key: 'darashia',  name: 'Darashia',    minLevel: null, zones: [] },
  { key: 'ankrahmun', name: 'Ankrahmun',   minLevel: null, zones: [] },
  { key: 'edron',     name: 'Edron',       minLevel: 400,  zones: [] },
  { key: 'svargrond', name: 'Svargrond',   minLevel: 475,  zones: [] },
  { key: 'libertybay',name: 'Liberty Bay', minLevel: 550,  zones: [] },
  { key: 'yalahar',   name: 'Yalahar',     minLevel: 650,  zones: [] },
  { key: 'farmine',   name: 'Farmine',     minLevel: 775,  zones: [] },
  { key: 'rathleton', name: 'Rathleton',   minLevel: 925,  zones: [] },
  { key: 'graybeach', name: 'Gray Beach',  minLevel: 1100, zones: [] },
  { key: 'issavi',    name: 'Issavi',      minLevel: 1300, zones: [] },
  { key: 'roshamuul', name: 'Roshamuul',   minLevel: 1550, zones: [] },
]
