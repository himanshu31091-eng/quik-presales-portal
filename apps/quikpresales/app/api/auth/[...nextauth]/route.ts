import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * NextAuth route. `authOptions` lives in lib/auth.ts so the OAuth-vs-credentials
 * fallback is decided in one place (mirrors quikscale / quiktrack / quikvc).
 *
 * Note: the _template version of this file imports `createAuthOptions` from
 * "@quikit/auth/options", which is not an export of @quikit/auth.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
