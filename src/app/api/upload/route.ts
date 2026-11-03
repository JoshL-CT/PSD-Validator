import { analyzePsd } from "@/lib/analyze";
import { createJob, saveRecord, writeFile } from "@/lib/storage";
import type { JobRecord } from "@/lib/types";


export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !/\.psd$/i.test(file.name)) {
    return Response.json({ error: "Upload a .psd file." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let analysis;
  try {
    analysis = analyzePsd(buffer, file.name);
  } catch (e) {
    return Response.json(
      { error: `Couldn't read that file as a PSD. ${e instanceof Error ? e.message : ""}`.trim() },
      { status: 422 },
    );
  }

  const id = await createJob();
  await writeFile(id, "original.psd", buffer);
  const record: JobRecord = { id, fileName: file.name, analysis };
  await saveRecord(record);
  return Response.json(record);
}
