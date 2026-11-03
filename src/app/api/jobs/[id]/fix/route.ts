import { analyzePsd } from "@/lib/analyze";
import { getEngine } from "@/lib/engines";
import { loadRecord, readFile, saveRecord, writeFile } from "@/lib/storage";
import type { FixRequestItem } from "@/lib/types";


export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/fix">) {
  const { id } = await ctx.params;
  const record = await loadRecord(id).catch(() => null);
  if (!record) return Response.json({ error: "Job not found." }, { status: 404 });

  const body = (await request.json()) as { fixes?: FixRequestItem[] };
  const fixes = body.fixes ?? [];
  if (!fixes.length) return Response.json({ error: "Pick at least one fix." }, { status: 400 });

  try {
    const engine = getEngine();
    const original = await readFile(id, "original.psd");
    const { buffer, log } = await engine.apply(original, record.analysis, fixes);
    await writeFile(id, "fixed.psd", buffer);
    const after = analyzePsd(buffer, record.fileName);
    record.fixed = { engine: engine.name, log, after };
    await saveRecord(record);
    return Response.json(record.fixed);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Fix failed." }, { status: 500 });
  }
}
