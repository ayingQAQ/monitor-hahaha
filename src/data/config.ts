import manifest from "../../theme.json";
import { api } from "./api";
import { resolveConfig } from "./config-values";
export async function loadConfig() {
  try {
    return resolveConfig(
      manifest.config,
      await api<unknown>(`/themes/${manifest.short}/config`),
    );
  } catch {
    return resolveConfig(manifest.config, {});
  }
}
