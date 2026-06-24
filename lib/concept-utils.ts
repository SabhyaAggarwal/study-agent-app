export type Concept = {
  id?: string;
  subject: string;
  concept: string;
  mastery_level: string | null;
  strong_areas: string[] | string | null;
  weak_areas: string[] | string | null;
  next_steps: string[] | string | null;
  last_updated: string | null;
};

const MASTERY_SCORES: Record<string, number> = {
  Strong: 4,
  Proficient: 3,
  Developing: 2,
  Introduced: 1,
  "In Progress": 0,
};

const SUBJECT_STYLES: Record<string, string> = {
  Physics: "bg-blue-500/15 text-blue-300 ring-blue-500/30",
  Biology: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Mathematics: "bg-purple-500/15 text-purple-300 ring-purple-500/30",
  "Computer Science": "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  Chemistry: "bg-red-500/15 text-red-300 ring-red-500/30",
};

const MASTERY_BADGE_STYLES: Record<string, string> = {
  Strong: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  Proficient: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  Developing: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  Introduced: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  "In Progress": "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};

export function getMasteryScore(level: string | null | undefined): number {
  if (!level) return 0;
  return MASTERY_SCORES[level] ?? 0;
}

export function getMasteryPercent(level: string | null | undefined): number {
  return (getMasteryScore(level) / 4) * 100;
}

export function getAverageMasteryPercent(concepts: Concept[]): number {
  if (concepts.length === 0) return 0;
  const total = concepts.reduce((sum, concept) => sum + getMasteryScore(concept.mastery_level), 0);
  return Math.round((total / concepts.length / 4) * 100);
}

export function getUniqueSubjectCount(concepts: Concept[]): number {
  return new Set(concepts.map((concept) => concept.subject)).size;
}

export function getSubjectStyles(subject: string): string {
  return SUBJECT_STYLES[subject] ?? "bg-slate-500/15 text-slate-300 ring-slate-500/30";
}

export function getMasteryBadgeStyles(level: string | null | undefined): string {
  if (!level) {
    return MASTERY_BADGE_STYLES["In Progress"];
  }
  return MASTERY_BADGE_STYLES[level] ?? MASTERY_BADGE_STYLES["In Progress"];
}

export function parseTags(value: string[] | string | null | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
