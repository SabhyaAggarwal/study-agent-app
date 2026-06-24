"use client";

import { useState } from "react";
import {
  type Concept,
  formatDate,
  getMasteryBadgeStyles,
  getMasteryPercent,
  getSubjectStyles,
  parseTags,
} from "@/lib/concept-utils";

type ConceptCardProps = {
  concept: Concept;
};

function TagList({ label, tags, tagClassName }: { label: string; tags: string[]; tagClassName: string }) {
  if (tags.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${tagClassName}`}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ConceptCard({ concept }: ConceptCardProps) {
  const [expanded, setExpanded] = useState(false);
  const masteryLevel = concept.mastery_level ?? "In Progress";
  const progress = getMasteryPercent(concept.mastery_level);
  const strongAreas = parseTags(concept.strong_areas);
  const weakAreas = parseTags(concept.weak_areas);
  const nextSteps = parseTags(concept.next_steps);

  return (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      className="w-full rounded-[2rem] border border-slate-800 bg-slate-900/95 p-6 text-left shadow-2xl shadow-slate-950/40 transition hover:border-slate-700 hover:bg-slate-900"
      aria-expanded={expanded}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${getSubjectStyles(concept.subject)}`}
            >
              {concept.subject}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${getMasteryBadgeStyles(concept.mastery_level)}`}
            >
              {masteryLevel}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-white">{concept.concept}</h3>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>Mastery progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
        <div className="shrink-0 text-sm text-slate-400">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last updated</p>
          <p className="mt-1 text-slate-300">{formatDate(concept.last_updated)}</p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-6 space-y-5 border-t border-slate-800 pt-6">
          <TagList
            label="Strong areas"
            tags={strongAreas}
            tagClassName="bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
          />
          <TagList
            label="Weak areas"
            tags={weakAreas}
            tagClassName="bg-rose-500/15 text-rose-300 ring-rose-500/30"
          />
          <TagList
            label="Next steps"
            tags={nextSteps}
            tagClassName="bg-sky-500/15 text-sky-300 ring-sky-500/30"
          />
          {strongAreas.length === 0 && weakAreas.length === 0 && nextSteps.length === 0 ? (
            <p className="text-sm text-slate-500">No detailed progress notes yet.</p>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
