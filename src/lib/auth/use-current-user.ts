import { onIdTokenChanged, signInAnonymously, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { authEnabled, setBearerToken } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
  isAnonymous: boolean;
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
  isAnonymous: false,
};

function normalizeUser(user: User): AppUser {
  return {
    id: user.uid,
    displayName: user.displayName,
    primaryEmail: user.email,
    profileImageUrl: user.photoURL,
    isDevFallback: false,
    isAnonymous: user.isAnonymous,
  };
}

export function useCurrentUserState(): CurrentUserState {
  const [user, setUser] = useState<AppUser | null>(authEnabled ? null : DEV_USER);
  const [isPending, setIsPending] = useState(authEnabled);

  useEffect(() => {
    if (!authEnabled) return;
    let creatingAnonymous = false;
    return onIdTokenChanged(auth, async (nextUser) => {
      if (!nextUser && !creatingAnonymous) {
        creatingAnonymous = true;
        try {
          await signInAnonymously(auth);
          return;
        } catch (error) {
          console.error("Firebase anonymous auth error", error);
        } finally {
          creatingAnonymous = false;
        }
      }
      try {
        setBearerToken(nextUser ? await nextUser.getIdToken() : null);
      } finally {
        setUser(nextUser ? normalizeUser(nextUser) : null);
        setIsPending(false);
      }
    });
  }, []);

  return { user, isPending };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
