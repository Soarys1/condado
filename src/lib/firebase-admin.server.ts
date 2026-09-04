/**
 * Condado no longer needs the Admin SDK on Vercel.
 * Auth and game data go through the Firebase web SDK + Firestore rules.
 * This file is kept so leftover imports fail loudly instead of initializing
 * a private key that must never ship to the browser.
 */
export function getAdminFirestore(): never {
  throw new Error("Admin SDK desativado. O Condado usa Firestore no cliente.");
}

export function getAdminAuth(): never {
  throw new Error("Admin SDK desativado. O Condado usa Firebase Auth no cliente.");
}
