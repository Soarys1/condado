import { onIdTokenChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { setBearerToken } from "./client";

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
  const [user, setUser] = useState<AppUser | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setUser((current) => current ?? (auth.currentUser ? normalizeUser(auth.currentUser) : null));
      setIsPending(false);
    }, 2500);
    const unsub = onIdTokenChanged(auth, async (nextUser) => {
      window.clearTimeout(timeout);
      try {
        setBearerToken(nextUser ? await nextUser.getIdToken() : null);
      } finally {
        setUser(nextUser ? normalizeUser(nextUser) : null);
        setIsPending(false);
      }
    });
    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, []);

  return { user, isPending };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
