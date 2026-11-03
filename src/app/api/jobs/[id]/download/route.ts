import { loadRecord, readFile } from "@/lib/storage";


export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]/download">) {
  const { id } = await ctx.params;
  const record = await loadRecord(id).catch(() => null);
  if (!record?.fixed) return Response.json({ error: "No fixed file yet." }, { status: 404 });

  const data = await readFile(id, "fixed.psd");
  const name = record.fileName.replace(/\.psd$/i, "") + "_optimized.psd";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/vnd.adobe.photoshop",
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
    },
  });
}
