import { promises as fs, createReadStream } from "fs";
import path from "path";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import { get, put } from "@vercel/blob";
import type { JobRecord } from "./types";

// Private Vercel Blob when BLOB_READ_WRITE_TOKEN is set, local disk (.jobs) otherwise.
const ROOT = path.join(process.cwd(), ".jobs");
const blobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

type FileName = "original.psd" | "fixed.psd";

export const JOB_ID = /^[a-f0-9-]{36}$/;
const safeId = (id: string) => {
  if (!JOB_ID.test(id)) throw new Error("Invalid job id");
  return id;
};

const key = (id: string, name: string) => `jobs/${safeId(id)}/${name}`;
const localPath = (id: string, name: string) => path.join(ROOT, safeId(id), name);

async function blobStream(pathname: string): Promise<ReadableStream<Uint8Array> | null> {
  const res = await get(pathname, { access: "private", useCache: false });
  return res && res.stream ? (res.stream as ReadableStream<Uint8Array>) : null;
}

async function write(id: string, name: string, data: Buffer | string, contentType: string) {
  if (blobEnabled()) {
    await put(key(id, name), data, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType,
    });
    return;
  }
  await fs.mkdir(path.dirname(localPath(id, name)), { recursive: true });
  await fs.writeFile(localPath(id, name), data);
}

async function read(id: string, name: string): Promise<Buffer> {
  if (blobEnabled()) {
    const stream = await blobStream(key(id, name));
    if (!stream) throw new Error("File not found.");
    return Buffer.from(await new Response(stream).arrayBuffer());
  }
  return fs.readFile(localPath(id, name));
}

export const createJob = async () => randomUUID();

export const writeFile = (id: string, name: FileName, data: Buffer) =>
  write(id, name, data, "image/vnd.adobe.photoshop");

export const readFile = (id: string, name: FileName) => read(id, name);

/** Streams a file without buffering it, so large downloads skip the response size limit. */
export async function streamFile(id: string, name: FileName): Promise<ReadableStream<Uint8Array>> {
  if (blobEnabled()) {
    const s = await blobStream(key(id, name));
    if (!s) throw new Error("File not found.");
    return s;
  }
  return Readable.toWeb(createReadStream(localPath(id, name))) as unknown as ReadableStream<Uint8Array>;
}

export const saveRecord = (rec: JobRecord) => write(rec.id, "job.json", JSON.stringify(rec), "application/json");

export async function loadRecord(id: string): Promise<JobRecord | null> {
  try {
    return JSON.parse((await read(id, "job.json")).toString("utf8"));
  } catch {
    return null;
  }
}
