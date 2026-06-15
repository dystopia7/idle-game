export type SkillType = 'CLUB' | 'AXE' | 'SWORD' | 'DISTANCE' | 'SHIELDING' | 'MAGIC'

export const ALL_SKILLS: SkillType[] = ['CLUB', 'AXE', 'SWORD', 'DISTANCE', 'SHIELDING', 'MAGIC']

export interface PlayerSkill {
  skill: SkillType
  level: number
  points: number
}
