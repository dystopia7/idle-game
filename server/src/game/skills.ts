import type { PrismaClient } from '@prisma/client'
import type { SkillType } from '@idle-rpg/shared'
import { SKILL_A, SKILL_B, SKILL_COMBAT_START, SKILL_MAGIC_START } from '@idle-rpg/shared'

export function skillStartLevel(skill: SkillType): number {
  return skill === 'MAGIC' ? SKILL_MAGIC_START : SKILL_COMBAT_START
}

// Points required to advance FROM the given level to the next (P = A * b^(level - c))
export function pointsToNextLevel(skill: SkillType, level: number): number {
  const c = skillStartLevel(skill)
  return Math.round(SKILL_A * Math.pow(SKILL_B, level - c))
}

export interface SkillGainResult {
  leveled: boolean
  newLevel: number
  newPoints: number
}

export async function grantSkillPoints(
  prisma: PrismaClient,
  playerId: string,
  skill: SkillType,
  amount: number,
): Promise<SkillGainResult> {
  const startLevel = skillStartLevel(skill)

  const existing = await prisma.playerSkill.findUnique({
    where: { playerId_skill: { playerId, skill } },
  })

  let level  = existing?.level  ?? startLevel
  let points = existing?.points ?? 0
  points += amount
  let leveled = false

  while (points >= pointsToNextLevel(skill, level)) {
    points -= pointsToNextLevel(skill, level)
    level++
    leveled = true
  }

  await prisma.playerSkill.upsert({
    where:  { playerId_skill: { playerId, skill } },
    create: { playerId, skill, level, points },
    update: { level, points },
  })

  return { leveled, newLevel: level, newPoints: points }
}

// Build a full skills array for init, filling in defaults for missing skills
export async function loadPlayerSkills(
  prisma: PrismaClient,
  playerId: string,
) {
  const rows = await prisma.playerSkill.findMany({ where: { playerId } })
  const ALL_SKILLS: SkillType[] = ['CLUB', 'AXE', 'SWORD', 'DISTANCE', 'SHIELDING', 'MAGIC']

  return ALL_SKILLS.map(skill => {
    const row = rows.find(r => r.skill === skill)
    return {
      skill,
      level:  row?.level  ?? skillStartLevel(skill),
      points: row?.points ?? 0,
    }
  })
}
