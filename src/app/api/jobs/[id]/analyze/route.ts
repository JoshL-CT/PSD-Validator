import { analyzePsd } from "@/lib/analyze";
import { JOB_ID, readFile, saveRecord } from "@/lib/storage";
import type { JobRecord } from "@/lib/types";

// Used after a direct to Blob upload: the file is already stored, so read and check it.
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/analyze">) {
  const { id } = await ctx.params;
  if (!JOB_ID.test(id)) return Response.json({ error: "Invalid job id." }, { status: 400 });

  const { fileName } = (await request.json().catch(() => ({}))) as { fileName?: string };
  const name = (fileName ?? "upload.psd").replace(/[^\w .()-]/g, "_").slice(0, 120);

  try {
    const buffer = await readFile(id, "original.psd");
    const record: JobRecord = { id, fileName: name, analysis: analyzePsd(buffer, name) };
    await saveRecord(record);
    return Response.json(record);
  } catch (e) {
    return Response.json(
      { error: `Couldn't read that file as a PSD. ${e instanceof Error ? e.message : ""}`.trim() },
      { status: 422 },
    );
  }
}
