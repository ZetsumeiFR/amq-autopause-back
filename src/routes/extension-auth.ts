import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { auth } from "../../lib/auth";

const router = Router();

// Temporary storage for OAuth state and session tokens
interface OAuthState {
  redirectUri: string;
  expiresAt: number;
}

interface SessionToken {
  sessionId: string;
  expiresAt: number;
}

const oauthStates = new Map<string, OAuthState>();
const sessionTokens = new Map<string, SessionToken>();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of oauthStates.entries()) {
    if (data.expiresAt < now) {
      oauthStates.delete(token);
    }
  }
  for (const [token, data] of sessionTokens.entries()) {
    if (data.expiresAt < now) {
      sessionTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * Extension OAuth initiation endpoint
 * Creates an OAuth authorization URL for Twitch with extension redirect handling
 */
router.get("/signin", async (req: Request, res: Response) => {
  try {
    const redirectUri = req.query.redirect_uri as string;

    if (!redirectUri) {
      return res.status(400).json({ error: "redirect_uri is required" });
    }

    // Validate that this is a Chrome extension redirect URI
    if (!redirectUri.startsWith("https://") || !redirectUri.includes(".chromiumapp.org")) {
      return res.status(400).json({ error: "Invalid redirect_uri format" });
    }

    console.log("[Extension Auth] Initiating OAuth flow for extension");
    console.log("[Extension Auth] Extension redirect URI:", redirectUri);

    // Generate state parameter for OAuth security
    const state = randomBytes(32).toString("hex");

    // Store the extension redirect URI with the state
    oauthStates.set(state, {
      redirectUri,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });

    // Build Twitch OAuth URL manually with our callback
    const twitchClientId = process.env.TWITCH_CLIENT_ID;
    const callbackUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/auth/extension/callback`;

    const authUrl = new URL("https://id.twitch.tv/oauth2/authorize");
    authUrl.searchParams.set("client_id", twitchClientId || "");
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "user:read:email");
    authUrl.searchParams.set("state", state);

    console.log("[Extension Auth] Redirecting to Twitch OAuth:", authUrl.toString());

    // Redirect to Twitch OAuth
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error("[Extension Auth] Error initiating OAuth:", error);
    res.status(500).json({ error: "Failed to initiate OAuth flow" });
  }
});

/**
 * Extension OAuth callback endpoint
 * Handles the redirect from Twitch after successful authentication
 */
router.get("/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;

    if (!code || !state) {
      return res.status(400).json({ error: "code and state parameters are required" });
    }

    // Retrieve the stored OAuth state
    const oauthState = oauthStates.get(state);
    if (!oauthState) {
      return res.status(400).json({ error: "Invalid or expired state" });
    }

    const extensionRedirectUri = oauthState.redirectUri;
    oauthStates.delete(state); // Clean up

    console.log("[Extension Auth] OAuth callback received with code");

    // Exchange code for access token with Twitch
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID || "",
        client_secret: process.env.TWITCH_CLIENT_SECRET || "",
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/api/auth/extension/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Failed to exchange authorization code");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Twitch
    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Client-Id": process.env.TWITCH_CLIENT_ID || "",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to get user info from Twitch");
    }

    const userData = await userResponse.json();
    const twitchUser = userData.data[0];

    console.log("[Extension Auth] Got Twitch user:", twitchUser.login);

    // Create or update user in Better Auth and create session
    // Use Better Auth's signIn method via API
    const session = await auth.api.signInEmail({
      email: twitchUser.email || `${twitchUser.id}@twitch.tv`,
      password: accessToken, // Use access token as password placeholder
      name: twitchUser.display_name,
      image: twitchUser.profile_image_url,
    }).catch(async () => {
      // If sign in fails, try to create the account
      return await auth.api.signUpEmail({
        email: twitchUser.email || `${twitchUser.id}@twitch.tv`,
        password: accessToken,
        name: twitchUser.display_name,
        image: twitchUser.profile_image_url,
      });
    });

    if (!session) {
      throw new Error("Failed to create session");
    }

    console.log("[Extension Auth] Session created");

    // Create a temporary session token for the extension to exchange
    const sessionToken = randomBytes(32).toString("hex");
    sessionTokens.set(sessionToken, {
      sessionId: session.token,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes to exchange
    });

    // Redirect back to the extension with the session token
    const redirectUrl = new URL(extensionRedirectUri);
    redirectUrl.searchParams.set("session_token", sessionToken);

    console.log("[Extension Auth] Redirecting to extension");
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("[Extension Auth] Error handling callback:", error);
    res.status(500).json({ error: "Failed to complete authentication" });
  }
});

/**
 * Exchange session token for full session data
 * Extension calls this endpoint with the session token to get user data
 */
router.post("/session", async (req: Request, res: Response) => {
  try {
    const { session_token } = req.body;

    if (!session_token) {
      return res.status(400).json({ error: "session_token is required" });
    }

    // Validate and retrieve the session token
    const tokenData = sessionTokens.get(session_token);
    if (!tokenData) {
      return res.status(401).json({ error: "Invalid or expired session token" });
    }

    if (tokenData.expiresAt < Date.now()) {
      sessionTokens.delete(session_token);
      return res.status(401).json({ error: "Session token expired" });
    }

    const sessionId = tokenData.sessionId;
    sessionTokens.delete(session_token); // Token is single-use

    console.log("[Extension Auth] Exchanging session token");

    // Get the full session from Better Auth using the session ID
    const session = await auth.api.getSession({
      headers: {
        authorization: `Bearer ${sessionId}`,
      },
    });

    if (!session) {
      return res.status(401).json({ error: "Invalid session" });
    }

    console.log("[Extension Auth] Session exchange successful for user:", session.user.id);

    // Return the session data
    res.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
      session: {
        token: session.session.token,
        expiresAt: new Date(session.session.expiresAt).getTime(),
      },
    });
  } catch (error) {
    console.error("[Extension Auth] Error exchanging session token:", error);
    res.status(500).json({ error: "Failed to exchange session token" });
  }
});

export default router;
