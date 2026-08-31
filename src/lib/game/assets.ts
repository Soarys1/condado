const KEYS = [
  "grass",
  "dirt",
  "castle",
  "watchtower",
  "catapult",
  "mine",
  "farm",
  "barracks",
  "camp",
  "training",
  "wall",
  "wall_h",
  "wall_v",
  "infantry",
  "archer",
  "cavalry",
  "general",
  "generaless",
  "defender",
  "arrow",
  "boulder",
  "impact",
  "splash",
] as const;

export type AssetKey = (typeof KEYS)[number];

const images: Partial<Record<AssetKey, HTMLImageElement>> = {};
let loaded = false;
let loading: Promise<void> | null = null;

export function getAsset(key: AssetKey): HTMLImageElement | null {
  const img = images[key];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

export function loadAssets(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = Promise.all(
    KEYS.map(
      (key) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            images[key] = img;
            resolve();
          };
          img.onerror = () => resolve();
          const ext = key === "grass" || key === "dirt" || key === "splash" ? "jpg" : "png";
          img.src = `/game/${key}.${ext}`;
        }),
    ),
  ).then(() => {
    loaded = true;
  });
  return loading;
}

export function assetsReady() {
  return loaded;
}
