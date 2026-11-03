import { readPsd, writePsd, initializeCanvas, type Layer } from "ag-psd";
import { createCanvas } from "@napi-rs/canvas";
import { walkLayers, layerPathKey } from "../analyze";
import type { LogEntry } from "../types";
import type { EditEngine } from "./types";

let ready = false;
function init() {
  if (ready) return;
  initializeCanvas((w, h) => createCanvas(w, h) as unknown as HTMLCanvasElement);
  ready = true;
}

interface Slot {
  layer: Layer;
  siblings: Layer[];
}

export const localEngine: EditEngine = {
  name: "Local editor",

  async apply(buffer, analysis, requests) {
    init();
    const psd = readPsd(buffer, { skipThumbnail: true });
    const slots = new Map<string, Slot>();
    walkLayers(psd.children, (layer, path, _d, siblings) => {
      slots.set(layerPathKey(path), { layer, siblings });
    });

    const log: LogEntry[] = [];
    const deletes: Slot[] = [];

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

      const slot = slots.get(issue.layerPath);
      if (!slot) {
        log.push(entry("failed", issue.fix.kind, "Layer not found in the file."));
        continue;
      }
      const { layer } = slot;

      switch (issue.fix.kind) {
        case "delete":
          deletes.push(slot);
          log.push(entry("applied", "Deleted layer"));
          break;

        case "rename": {
          const newName = (req.newName ?? issue.fix.suggestedName ?? "").trim();
          if (!newName) {
            log.push(entry("skipped", "Rename", "No new name was given."));
            break;
          }
          const old = layer.name;
          layer.name = newName;
          log.push(entry("applied", `Renamed "${old}" to "${newName}"`));
          break;
        }

        case "rasterize":
          if (!layer.placedLayer) {
            log.push(entry("skipped", "Rasterize", "Layer is no longer a Smart Object."));
            break;
          }
          if (!layer.canvas) {
            log.push(entry("failed", "Rasterize", "No pixel data to keep. Rasterize in Photoshop."));
            break;
          }
          delete layer.placedLayer;
          log.push(entry("applied", "Rasterized Smart Object"));
          break;

        case "convert-paragraph": {
          const t = layer.text;
          if (!t) {
            log.push(entry("skipped", "Convert text", "Layer is no longer text."));
            break;
          }
          const scale = t.transform?.[0] || 1;
          const left = layer.left ?? 0;
          const textW = (layer.right ?? 0) - left;
          const textH = (layer.bottom ?? 0) - (layer.top ?? 0);
          const room = Math.max(textW, psd.width - left);
          const boxW = Math.min(textW * 1.4, room);
          t.shapeType = "box";
          t.boxBounds = [0, 0, boxW / scale, (textH * 1.2) / scale];
          t.pointBase = undefined;
          log.push(entry("applied", `Converted to paragraph text, box ${Math.round(boxW)}px wide`));
          break;
        }

        default:
          log.push(entry("skipped", "No change", issue.fix.description));
      }
    }

    // Delete last, highest index first, so earlier paths stay valid.
    const bySiblings = new Map<Layer[], Layer[]>();
    for (const d of deletes) {
      bySiblings.set(d.siblings, [...(bySiblings.get(d.siblings) ?? []), d.layer]);
    }
    for (const [siblings, layers] of bySiblings) {
      for (const layer of layers) {
        const idx = siblings.indexOf(layer);
        if (idx >= 0) siblings.splice(idx, 1);
      }
    }

    const out = writePsd(psd, { generateThumbnail: false });
    return { buffer: Buffer.from(out), log };
  },
};
