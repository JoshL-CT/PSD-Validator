import { readPsd, type Layer } from "ag-psd";
import type { AnalysisResult, Issue } from "./types";

const MB = 1024 * 1024;
export const SIZE_TARGET = 500 * MB;
export const SIZE_LIMIT = 4 * 1024 * MB;

const AMBIGUOUS = /(^|[\s_-])(copy(\s*\d+)?|final\s*\d*|v\d+|old)($|[\s_-])/i;
const GENERIC = /^(layer|group|text|smart object|shape|rectangle|ellipse|object)\s*\d*$/i;
const GUIDE = /(^|[\s_-])(guides?|reference|ref)($|[\s_-])/i;
const STATIC_HINT =
  /(background|\bbg\b|texture|stadium|field|lighting|light|overlay|grain|noise|pattern|gradient|turf)/i;

export const layerPathKey = (path: number[]) => path.join("/");

/** Flat walk used by the analyzer and by the local fix engine so both agree on paths. */
export function walkLayers(
  layers: Layer[] | undefined,
  visit: (layer: Layer, path: number[], depth: number, parent: Layer[]) => void,
  basePath: number[] = [],
  depth = 1,
) {
  (layers ?? []).forEach((layer, i) => {
    const path = [...basePath, i];
    visit(layer, path, depth, layers!);
    if (layer.children) walkLayers(layer.children, visit, path, depth + 1);
  });
}

function cleanName(name: string): string {
  return name
    .replace(/(^|[\s_-])(copy(\s*\d+)?|final\s*\d*|v\d+|old)(?=$|[\s_-])/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameFromText(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join("_");
}

export function analyzePsd(buffer: Buffer, fileName: string): AnalysisResult {
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });

  const issues: Issue[] = [];
  let layerCount = 0;
  let n = 0;
  const add = (i: Omit<Issue, "id">) => issues.push({ ...i, id: `i${++n}` });

  if (buffer.length > SIZE_LIMIT) {
    add({
      rule: "file-size",
      severity: "error",
      title: "File is over the 4GB hard limit",
      detail: `This file is ${(buffer.length / MB).toFixed(0)}MB. Files near 4GB cause upload failures and mapping errors.`,
      guideRef: "3a File Size & Performance",
      layerPath: "",
      layerName: fileName,
      fix: { kind: "none", description: "Strip hidden layers and rasterize static layers, then recheck." },
    });
  } else if (buffer.length > SIZE_TARGET) {
    add({
      rule: "file-size",
      severity: "warning",
      title: "File is over the 500MB recommended target",
      detail: `This file is ${(buffer.length / MB).toFixed(0)}MB. Smaller files map faster and produce fewer errors.`,
      guideRef: "3a File Size & Performance",
      layerPath: "",
      layerName: fileName,
      fix: { kind: "none", description: "Fixing the other issues below usually brings the size down." },
    });
  }

  walkLayers(psd.children, (layer, path, depth) => {
    layerCount++;
    const name = layer.name ?? "";
    const base = { layerPath: layerPathKey(path), layerId: layer.id, layerName: name };
    const isGroup = !!layer.children;

    if (layer.hidden) {
      add({
        ...base,
        rule: "hidden-layer",
        severity: "error",
        title: "Hidden layer",
        detail: `"${name}" is hidden. Hidden layers add file size and create mapping ambiguity. Delete them, don't just hide them.`,
        guideRef: "3e Layer Structure & Organization",
        fix: { kind: "delete", description: "Delete this layer." },
      });
      return;
    }

    if (layer.text && !(layer.text.text ?? "").trim()) {
      add({
        ...base,
        rule: "empty-text",
        severity: "warning",
        title: "Empty text layer",
        detail: `"${name}" has no text in it.`,
        guideRef: "3e Layer Structure & Organization",
        fix: { kind: "delete", description: "Delete this layer." },
      });
      return;
    }

    if (GUIDE.test(name)) {
      add({
        ...base,
        rule: "guide-layer",
        severity: "warning",
        title: "Guide or reference layer",
        detail: `"${name}" looks like a guide or reference element that is not part of the output.`,
        guideRef: "3e Layer Structure & Organization",
        fix: { kind: "delete", description: "Delete this layer." },
      });
      return;
    }

    if (AMBIGUOUS.test(name)) {
      const suggestedName = cleanName(name);
      const usable = suggestedName && !GENERIC.test(suggestedName);
      add({
        ...base,
        rule: "ambiguous-name",
        severity: "warning",
        title: "Ambiguous layer name",
        detail: `"${name}" contains Copy, Final, v2 or old. These names create mapping ambiguity.`,
        guideRef: "3b Semantic Layer Naming",
        fix: {
          kind: "rename",
          description: usable ? `Rename to "${suggestedName}".` : "Give this layer a name that describes its data.",
          suggestedName: usable ? suggestedName : "",
          needsInput: !usable,
        },
      });
    } else if (GENERIC.test(name)) {
      const suggestedName = layer.text?.text ? nameFromText(layer.text.text) : "";
      add({
        ...base,
        rule: "generic-name",
        severity: "warning",
        title: "Generic layer name",
        detail: `"${name}" doesn't say what data the layer holds, so the Template Assistant can't map it.`,
        guideRef: "3b Semantic Layer Naming",
        fix: {
          kind: "rename",
          description: suggestedName
            ? `Rename to "${suggestedName}" (from its text). Edit it if that's wrong.`
            : "Give this layer a name that describes its data, like Home_Team_Name.",
          suggestedName,
          needsInput: true,
        },
      });
    } else if (isGroup && name !== name.toUpperCase()) {
      add({
        ...base,
        rule: "group-name-case",
        severity: "info",
        title: "Group name isn't uppercase",
        detail: `Group names should be uppercase and descriptive, like PLAYER IMAGES or SCORE.`,
        guideRef: "3e Layer Structure & Organization",
        fix: { kind: "rename", description: `Rename to "${name.toUpperCase()}".`, suggestedName: name.toUpperCase() },
      });
    }

    if (layer.text && layer.text.shapeType !== "box") {
      add({
        ...base,
        rule: "point-text",
        severity: "warning",
        title: "Point text can overflow the canvas",
        detail: `"${name}" is point text with no bounding box. A longer generated value will run off the canvas or overlap other elements.`,
        guideRef: "3c Point Text vs. Paragraph Text",
        fix: {
          kind: "convert-paragraph",
          description: "Convert to paragraph text with a box about 40% wider than the current text, kept inside the canvas.",
        },
      });
    }

    if (layer.placedLayer) {
      if (STATIC_HINT.test(name)) {
        add({
          ...base,
          rule: "static-smart-object",
          severity: "warning",
          title: "Static Smart Object",
          detail: `"${name}" looks like a background or texture. Static Smart Objects inflate file size and should be rasterized.`,
          guideRef: "3d Smart Objects",
          fix: { kind: "rasterize", description: "Rasterize this Smart Object." },
        });
      } else {
        add({
          ...base,
          rule: "static-smart-object",
          severity: "info",
          title: "Smart Object to confirm",
          detail: `"${name}" is a Smart Object. Keep it only if the system swaps it per generation, like a player image or team logo.`,
          guideRef: "3d Smart Objects",
          fix: { kind: "none", description: "No change. Confirm this one is meant to be swapped." },
        });
      }
    }

    if (isGroup && depth > 3) {
      add({
        ...base,
        rule: "group-depth",
        severity: "warning",
        title: "Groups nested too deeply",
        detail: `"${name}" sits ${depth} levels deep. The AI review reads top level and first level groups primarily, so keep nesting to 3 levels.`,
        guideRef: "3e Layer Structure & Organization",
        fix: { kind: "none", description: "Needs a designer to restructure the groups." },
      });
    }
  });

  return {
    fileName,
    fileSize: buffer.length,
    width: psd.width,
    height: psd.height,
    layerCount,
    issues,
  };
}
