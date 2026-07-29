import NextAuth from "next-auth";
import { createAuthOptions } from "@quikit/auth/options";

/**
 * NextAuth route — uses the shared options factory so all apps stay aligned.
 *
 * Don't customize `authOptions` here. Cross-app changes go in
 * @quikit/auth/options. App-specific extensions (rare) need architect approval.
 */
const authOptions = createAuthOptions();
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
