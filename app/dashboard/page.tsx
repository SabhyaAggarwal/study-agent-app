import { ConceptCard } from "@/components/concept-card";
import { NavBar } from "@/components/nav-bar";
import {
  type Concept,
  getAverageMasteryPercent,
  getUniqueSubjectCount,
} from "@/lib/concept-utils";
import { createClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function StatsCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[2rem] border border-slate-800 bg-slate-900/95 px-6 py-5 shadow-2xl shadow-slate-950/40">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
    </div>
  );
}

export default async function DashboardPage() {
  let concepts: Concept[] = [];
  let error: { message: string } | null = null;

  try {
    const supabase = createClient();
    const result = await supabase
      .from("concepts")
      .select("*")
      .order("last_updated", { ascending: false });

    concepts = (result.data ?? []) as Concept[];
    error = result.error;
  } catch (err) {
    error = {
      message:
        err instanceof Error
          ? err.message
          : "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  const totalConcepts = concepts.length;
  const uniqueSubjects = getUniqueSubjectCount(concepts);
  const averageMastery = getAverageMasteryPercent(concepts);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <NavBar />

        <header className="mb-6 rounded-[2rem] border border-slate-800 bg-slate-900/95 px-7 py-6 shadow-2xl shadow-slate-950/40">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Study agent</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Progress dashboard</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-400">
            Track every concept you have studied, your mastery level, and what to focus on next.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-[2rem] border border-rose-500/30 bg-rose-500/10 px-6 py-4 text-sm text-rose-300">
            Unable to load concepts: {error.message}
          </div>
        ) : null}

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <StatsCard label="Concepts studied" value={totalConcepts} />
          <StatsCard label="Unique subjects" value={uniqueSubjects} />
          <StatsCard label="Average mastery" value={`${averageMastery}%`} />
        </section>

        {concepts.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-950/80 px-8 py-12 text-center text-slate-500">
            No concepts saved yet. Chat with the tutor and save your progress to see it here.
          </div>
        ) : (
          <section className="grid gap-4">
            {concepts.map((concept) => (
              <ConceptCard
                key={concept.id ?? `${concept.subject}-${concept.concept}`}
                concept={concept}
              />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
