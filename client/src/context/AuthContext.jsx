import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { socket } from "../services/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getSessionWithRetry(attempts = 5, delayMs = 200) {
      for (let i = 0; i < attempts; i++) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          return session;
        } catch (err) {
          const msg = err?.message || "";
          if (msg.includes("Navigator Lock") || msg.includes("LockAcquireTimeoutError")) {
            console.warn("Supabase auth lock failed, retrying...", i + 1, err);
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
            continue;
          }
          throw err;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    }

    (async () => {
      try {
        const session = await getSessionWithRetry();
        setUser(session?.user ?? null);
        if (session?.user) connectSocket(session.access_token);
      } catch (err) {
        console.error("Failed to get initial supabase session:", err);
      } finally {
        setLoading(false);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      try {
        setUser(session?.user ?? null);
        if (session?.user) {
          connectSocket(session.access_token);
        } else {
          socket.disconnect();
        }
      } catch (err) {
        console.error("Auth state change handler error:", err);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function connectSocket(token) {
    if (socket.connected) return;
    socket.auth = { token };
    socket.connect();
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/lobby` },
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    socket.disconnect();
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
