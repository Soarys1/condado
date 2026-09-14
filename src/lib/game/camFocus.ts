export type CamFocus = "atk" | "def" | "village";

let pending: CamFocus | null = null;

export function requestCamFocus(next: CamFocus) {
  pending = next;
}

export function takeCamFocus(): CamFocus | null {
  const next = pending;
  pending = null;
  return next;
}
