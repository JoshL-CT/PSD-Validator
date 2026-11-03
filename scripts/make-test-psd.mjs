// Builds a small PSD with the problems the best practices guide calls out.
import { writePsd, initializeCanvas } from "ag-psd";
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "fs";

initializeCanvas((w, h) => createCanvas(w, h));

const px = (color, w = 40, h = 40) => {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
};
const text = (name, value, extra = {}) => ({
  name, left: 20, top: 20, right: 220, bottom: 60, canvas: px("#fff", 200, 40),
  text: { text: value, shapeType: "point", transform: [1, 0, 0, 1, 20, 50] }, ...extra,
});
const raster = (name, extra = {}) => ({ name, left: 0, top: 0, right: 40, bottom: 40, canvas: px("#888"), ...extra });

const psd = {
  width: 800, height: 600,
  children: [
    text("Layer 1", "Preseason starts now"),
    text("Home Team Name Copy", "San Francisco"),
    text("Headline", "Boxed already", { text: { text: "Boxed already", shapeType: "box", boxBounds: [0, 0, 200, 40], transform: [1, 0, 0, 1, 20, 50] } }),
    text("Empty", "   "),
    raster("Old Backup", { hidden: true }),
    raster("Guide Lines"),
    raster("Stadium Lighting", { placedLayer: { id: "20953ddb-9391-11ec-b4f1-c15674f50bc1", placed: "20953ddb-9391-11ec-b4f1-c15674f50bc1", type: "raster", transform: [0,0,40,0,40,40,0,40], width: 40, height: 40, resolution: { value: 72, units: "Density" } } }),
    raster("Player Image 1", { placedLayer: { id: "20953ddb-9391-11ec-b4f1-c15674f50bc2", placed: "20953ddb-9391-11ec-b4f1-c15674f50bc2", type: "raster", transform: [0,0,40,0,40,40,0,40], width: 40, height: 40, resolution: { value: 72, units: "Density" } } }),
    { name: "score box", children: [raster("Away Team Score")] },
    { name: "A", children: [{ name: "B", children: [{ name: "C", children: [{ name: "deep group", children: [raster("Logo")] }] }] }] },
  ],
};
writeFileSync(process.argv[2], Buffer.from(writePsd(psd, { generateThumbnail: false })));
console.log("wrote", process.argv[2]);
