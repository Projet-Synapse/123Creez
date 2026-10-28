// Powered by OnSpace.AI — Connexion par compte Google (Supabase Auth PKCE).
// Porté du modèle 123Ecriture (lib/sync/AuthContext.tsx) : le client
// Supabase et la session vivent entièrement dans le renderer ; le pont
// `creezDesktop.auth` ne fait qu'ouvrir le navigateur système et relayer le
// callback `app123creez://auth-callback` (voir desktop/auth.js).
// Même état dégradé que là-bas : sans pont Electron ou sans client configuré,
// `available` reste `false` et l'interface affiche un message plutôt qu'un
// bouton cassé.
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getSupabaseClient, parseAuthCallbackUrl } from '@/services/supabaseService';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { isDesktop, desktop, isNative } from '@/services/platform';

const REDIRECT_TO = 'app123creez://auth-callback';

type AuthUser = { id: string; email: string | null };

type AuthContextValue = {
  session: Session | null;
  user: AuthUser | null;
  loading: boolean;
  available: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthReactContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Desktop : pont Electron. Android/iOS : navigateur in-app (expo-web-browser)
  // + retour par le scheme app123creez:// (déclaré dans app.json).
  const available = (isDesktop() && !!desktop()?.auth) || isNative();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(available);
  const [error, setError] = useState<string | null>(null);

  // Session courante au montage + abonnement aux changements (connexion,
  // déconnexion, rafraîchissement de token) — géré par supabase-js.
  useEffect(() => {
    const supabase = getSupabaseClient();
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      } catch (err) {
        console.error('[auth] échec de récupération de la session :', err);
      } finally {
        setLoading(false);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      // Une session qui s'établit invalide toute erreur d'auth périmée
      // (cas vécu chez 123Ecriture : second passage du même callback sur un
      // code déjà consommé laissait l'erreur affichée par-dessus l'état
      // connecté).
      if (newSession) setError(null);
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  // Callback OAuth reçu via le protocole app123creez:// — idempotent et
  // gardé par session (mêmes raisons que chez 123Ecriture).
  const handledCallbackUrls = useRef<Set<string>>(new Set());
  const exchangeCallbackUrl = useCallback((url: string) => {
    const supabase = getSupabaseClient();
    if (handledCallbackUrls.current.has(url)) return;
    handledCallbackUrls.current.add(url);
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setError(null);
          return;
        }
        const { code, error: oauthError } = parseAuthCallbackUrl(url);
        if (oauthError) throw new Error(oauthError);

        // Fallback flux implicite (tokens dans le #fragment) : on pose la
        // session directement. Ne devrait plus arriver depuis flowType pkce,
        // mais couvre un client resté sur l'ancien flux.
        const hashIndex = url.indexOf('#');
        if (code === null && hashIndex !== -1) {
          const frag = new URLSearchParams(url.slice(hashIndex + 1));
          const accessToken = frag.get('access_token');
          const refreshToken = frag.get('refresh_token');
          if (accessToken && refreshToken) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (setErr) throw setErr;
            setError(null);
            return;
          }
        }

        if (!code) return; // rien à échanger (URL sans code : déjà traitée)
        // auth-js 2.70 (lockfile de ce projet) : la surcharge flowId n'existe
        // pas encore — le code suffit (voir 123Ecriture pour la variante
        // récente avec { flowId }).
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        setError(null);
      } catch (err) {
        console.error('[auth] échec de connexion :', err);
        setError(String((err as Error)?.message ?? err));
      }
    })();
  }, []);

  useEffect(() => {
    const bridge = isDesktop() ? desktop()?.auth : undefined;
    if (!bridge) return;
    const unsubscribe = bridge.onCallback(exchangeCallbackUrl);
    // Démarrage à froid : l'app lancée PAR le lien de callback reçoit l'URL
    // dans argv — le process principal la met de côté, le renderer la tire
    // ici une seule fois (voir desktop/auth.js).
    if (bridge.takePendingUrl) {
      void bridge.takePendingUrl().then((url) => {
        if (url) exchangeCallbackUrl(url);
      });
    }
    return unsubscribe;
  }, [exchangeCallbackUrl]);

  // Mobile : filet de sécurité si le retour arrive par un lien (démarrage à
  // froid ou navigateur qui ne renvoie pas le résultat) — idempotent.
  useEffect(() => {
    if (!isNative()) return;
    const handle = (url: string | null) => {
      if (url && url.startsWith(REDIRECT_TO)) exchangeCallbackUrl(url);
    };
    void Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [exchangeCallbackUrl]);

  const signInWithGoogle = useCallback(async () => {
    if (isNative()) {
      setError(null);
      try {
        const { data, error: oauthError } = await getSupabaseClient().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
        });
        if (oauthError) throw oauthError;
        if (!data.url) throw new Error('Supabase n’a pas renvoyé d’URL de connexion.');
        const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT_TO);
        if (result.type === 'success' && result.url) exchangeCallbackUrl(result.url);
      } catch (err) {
        console.error('[auth] échec du lancement de la connexion :', err);
        setError(String((err as Error)?.message ?? err));
      }
      return;
    }
    const bridge = isDesktop() ? desktop()?.auth : undefined;
    if (!bridge) return;
    setError(null);
    try {
      // skipBrowserRedirect : supabase-js renvoie l'URL au lieu de naviguer
      // la fenêtre de l'app (Google bloque les formulaires dans Electron) —
      // elle est ouverte dans le navigateur système via le pont.
      const { data, error: oauthError } = await getSupabaseClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: REDIRECT_TO, skipBrowserRedirect: true },
      });
      if (oauthError) throw oauthError;
      if (!data.url) throw new Error('Supabase n’a pas renvoyé d’URL de connexion.');
      await bridge.openExternal(data.url);
    } catch (err) {
      console.error('[auth] échec du lancement de la connexion :', err);
      setError(String((err as Error)?.message ?? err));
    }
  }, [exchangeCallbackUrl]);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut();
      if (signOutError) throw signOutError;
    } catch (err) {
      console.error('[auth] échec de la déconnexion :', err);
      setError(String((err as Error)?.message ?? err));
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const user: AuthUser | null = session?.user
      ? { id: session.user.id, email: session.user.email ?? null }
      : null;
    return { session, user, loading, available, error, signInWithGoogle, signOut };
  }, [session, loading, available, error, signInWithGoogle, signOut]);

  return <AuthReactContext.Provider value={value}>{children}</AuthReactContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthReactContext);
  if (!ctx) {
    throw new Error('useAuth() doit être appelé sous <AuthProvider>');
  }
  return ctx;
}
