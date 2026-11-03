import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import type { LogEntry } from "../types";
import type { EditEngine } from "./types";

/**
 * Photoshop API engine.
 *
 * UNVERIFIED: request shapes below follow Adobe's documentOperations (V1) format as
 * best known. They have not been run against the live API yet, and Adobe's docs
 * pages were unreachable while this was written. Check them against the current
 * reference before relying on this engine. Delete and rename are sent to the API.
 * Rasterize and paragraph conversion are reported as skipped until a verified
 * operation is wired in.
 */

const IMS = "https://ims-na1.adobelogin.com/ims/token/v3";
const API = "https://image.adobe.io/pie/psdService/documentOperations";

async function token(id: string, secret: string) {
  const res = await fetch(IMS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      grant_type: "client_credentials",
      scope: "openid,AdobeID,read_organizations,firefly_api,ff_apis",
    }),
  });
  if (!res.ok) throw new Error(`Adobe sign in failed (${res.status})`);
  return (await res.json()).access_token as string;
}

export const photoshopEngine: EditEngine = {
  name: "Photoshop API",

  async apply(buffer, analysis, requests) {
    const clientId = process.env.ADOBE_CLIENT_ID;
    const secret = process.env.ADOBE_CLIENT_SECRET;
    const bucket = process.env.S3_BUCKET;
    if (!clientId || !secret || !bucket) {
      throw new Error("Photoshop API needs ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET and S3_BUCKET.");
    }

    const log: LogEntry[] = [];
    const layers: Record<string, unknown>[] = [];

    for (const req of requests) {
      const issue = analysis.issues.find((i) => i.id === req.issueId);
      if (!issue) continue;
      const entry = (status: LogEntry["status"], action: string, detail?: string): LogEntry => ({
        issueId: issue.id,
        rule: issue.rule,
        layerName: issue.layerName,
        action,
        status,
        detail,
      });

      if (issue.layerId === undefined) {
        log.push(entry("failed", issue.fix.kind, "Layer has no id, so the API can't target it."));
      } else if (issue.fix.kind === "delete") {
        layers.push({ id: issue.layerId, delete: {} });
        log.push(entry("applied", "Deleted layer"));
      } else if (issue.fix.kind === "rename") {
        const name = (req.newName ?? issue.fix.suggestedName ?? "").trim();
        if (!name) {
          log.push(entry("skipped", "Rename", "No new name was given."));
        } else {
          layers.push({ id: issue.layerId, edit: {}, name });
          log.push(entry("applied", `Renamed "${issue.layerName}" to "${name}"`));
        }
      } else {
        log.push(entry("skipped", issue.fix.kind, "Not supported by the Photoshop API engine yet."));
      }
    }

    if (!layers.length) return { buffer, log };

    const s3 = new S3Client({ region: process.env.S3_REGION });
    const key = `psd-validator/${randomUUID()}`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `${key}/in.psd`, Body: buffer }));
    const inHref = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: `${key}/in.psd` }), { expiresIn: 3600 });
    const outHref = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: `${key}/out.psd` }), { expiresIn: 3600 });

    const bearer = await token(clientId, secret);
    const headers = { Authorization: `Bearer ${bearer}`, "x-api-key": clientId, "Content-Type": "application/json" };

    const start = await fetch(API, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: [{ href: inHref, storage: "external" }],
        options: { layers },
        outputs: [{ href: outHref, storage: "external", type: "vnd.adobe.photoshop" }],
      }),
    });
    if (!start.ok) throw new Error(`Photoshop API rejected the job (${start.status}): ${await start.text()}`);
    const statusUrl = (await start.json())._links?.self?.href as string;

    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await (await fetch(statusUrl, { headers })).json();
      const out = poll.outputs?.[0];
      if (out?.status === "succeeded") {
        const res = await fetch(await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: `${key}/out.psd` })));
        return { buffer: Buffer.from(await res.arrayBuffer()), log };
      }
      if (out?.status === "failed") throw new Error(`Photoshop API job failed: ${JSON.stringify(out.errors ?? out)}`);
    }
    throw new Error("Photoshop API job timed out.");
  },
};
