import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';

// Helper function to refresh Google access token
async function refreshAccessToken(token: any) {
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                grant_type: 'refresh_token',
                refresh_token: token.refreshToken,
            }),
        });

        const refreshedTokens = await response.json();

        if (!response.ok) {
            console.error('Token refresh failed:', refreshedTokens);
            throw refreshedTokens;
        }

        console.log('Token refreshed successfully');

        return {
            ...token,
            accessToken: refreshedTokens.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
            // Keep the old refresh token if a new one wasn't provided
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
        };
    } catch (error) {
        console.error('Error refreshing access token:', error);
        return {
            ...token,
            error: 'RefreshAccessTokenError',
        };
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" },
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope: [
                        'openid',
                        'email',
                        'profile',
                        'https://www.googleapis.com/auth/youtube',  // Full YouTube access (includes delete)
                        'https://www.googleapis.com/auth/youtube.upload',
                        'https://www.googleapis.com/auth/drive.readonly',
                    ].join(' '),
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account, user }) {
            // Initial sign in - store tokens and user id
            if (account && user) {
                console.log('Initial login - storing tokens and user id');
                return {
                    ...token,
                    accessToken: account.access_token,
                    refreshToken: account.refresh_token,
                    expiresAt: account.expires_at,
                    userId: (user as any).id,
                };
            }

            // Return token if not expired (with 5 minute buffer)
            const expiresAt = token.expiresAt as number | undefined;
            if (expiresAt && Date.now() < (expiresAt - 300) * 1000) {
                return token;
            }

            // Token expired, try to refresh
            console.log('Access token expired, refreshing...');
            return await refreshAccessToken(token);
        },
        async session({ session, token }) {
            // Send accessToken to the client
            session.accessToken = token.accessToken as string;
            // Expose user id on the session for server APIs
            try {
                const userIdFromToken = (token as any).userId as string | undefined;
                // Fallback to sub which is standard in JWT
                const sub = token.sub;

                if (userIdFromToken) {
                    session.user = session.user || ({} as any);
                    (session.user as any).id = userIdFromToken;
                } else if (sub) {
                    session.user = session.user || ({} as any);
                    (session.user as any).id = sub;
                }
            } catch (e) {
                // ignore
            }
            // Optionally expose error to client for handling
            if (token.error) {
                session.error = token.error as string;
            }
            return session;
        },
    },
    pages: {
        signIn: '/',
    },
});

// Extend the Session type
declare module 'next-auth' {
    interface Session {
        accessToken?: string;
        error?: string;
    }
}
