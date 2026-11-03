import { localEngine } from "./local";
import { photoshopEngine } from "./photoshop";
import type { EditEngine } from "./types";

export function getEngine(): EditEngine {
  return process.env.EDIT_ENGINE === "photoshop" ? photoshopEngine : localEngine;
}
