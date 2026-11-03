import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { JobRecord } from "./types";

// Local disk store for uploaded and fixed files. Swap for S3 or Blob when deploying.
const ROOT = path.join(process.cwd(), ".jobs");

const safeId = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid job id");
  return id;
};

const dir = (id: string) => path.join(ROOT, safeId(id));

export async function createJob(): Promise<string> {
  const id = randomUUID();
  await fs.mkdir(dir(id), { recursive: true });
  return id;
}

export const writeFile = (id: string, name: "original.psd" | "fixed.psd", data: Buffer) =>
  fs.writeFile(path.join(dir(id), name), data);

export const readFile = (id: string, name: "original.psd" | "fixed.psd") =>
  fs.readFile(path.join(dir(id), name));

export const saveRecord = (rec: JobRecord) =>
  fs.writeFile(path.join(dir(rec.id), "job.json"), JSON.stringify(rec));

export async function loadRecord(id: string): Promise<JobRecord | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir(id), "job.json"), "utf8"));
  } catch {
    return null;
  }
}
