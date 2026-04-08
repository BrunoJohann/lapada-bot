export function calculateScore(
  messageCount: number,
  voiceMinutes: number,
  streamMinutes: number,
  reactionsCount: number,
  streakDays: number = 0,
  voiceMultiplier: number = 2.0,
  streamMultiplier: number = 0
): number {
  const base =
    messageCount * 1.0 +
    voiceMinutes * voiceMultiplier +
    streamMinutes * streamMultiplier +
    reactionsCount * 1.5;

  return base * (1 + streakDays * 0.05);
}
