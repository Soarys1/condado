import { onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { authEnabled } from "./client";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
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
};

function normalizeUser(user: User): AppUser {
  return {
    id: user.uid,
    displayName: user.displayName,
    primaryEmail: user.email,
    profileImageUrl: user.photoURL,
    isDevFallback: false,
  };
}

export function useCurrentUserState(): CurrentUserState {
  const [user, setUser] = useState<AppUser | null>(authEnabled ? null : DEV_USER);
  const [isPending, setIsPending] = useState(authEnabled);

  useEffect(() => {
    if (!authEnabled) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser ? normalizeUser(nextUser) : null);
      setIsPending(false);
    });
  }, []);

  return { user, isPending };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
