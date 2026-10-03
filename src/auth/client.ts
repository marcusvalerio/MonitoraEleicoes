"use client";
import { createAuthClient } from "better-auth/react";

/** Cliente do provedor (mesma origem; cookies httpOnly — nada de senha/token em localStorage). */
export const authClient = createAuthClient();
