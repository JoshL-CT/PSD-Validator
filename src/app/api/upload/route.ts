import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { analyzePsd } from "@/lib/analyze";
import { createJob, saveRecord, writeFile } from "@/lib/storage";
import type { JobRecord } from "@/lib/types";

const GB = 1024 * 1024 * 1024;

export async function POST(request: Request) {
  // Browser to Blob direct upload: this call only hands out a short lived upload token.
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      const body = (await request.json()) as HandleUploadBody;
      const json = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname) => {
          if (!/^jobs\/[a-f0-9-]{36}\/original\.psd$/.test(pathname)) throw new Error("Unexpected upload path.");
          return { maximumSizeInBytes: 4 * GB, addRandomSuffix: false, allowOverwrite: true };
        },
        onUploadCompleted: async () => {},
      });
      return Response.json(json);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
    }
  }

  // Local mode: the file arrives in the request body.
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
