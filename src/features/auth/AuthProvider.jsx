import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { auth, firebaseConfigured } from '../../firebase/client.js';
import { savePendingRegistrationAvatar } from '../profile/avatars.js';
import { createAuthError, toFriendlyAuthError } from './authErrors.js';

const AuthContext = createContext(null);

function assertAuthAvailable() {
  if (!firebaseConfigured) throw createAuthError('auth/not-configured');
}

async function runAuthAction(action) {
  assertAuthAvailable();
  try {
    return await action();
  } catch (error) {
    throw toFriendlyAuthError(error);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    if (!firebaseConfigured) return undefined;

    let active = true;
    let unsubscribe = () => {};

    Promise.resolve()
      .then(() => setPersistence(auth, browserLocalPersistence))
      .catch(() => undefined)
      .then(() => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(
          auth,
          (nextUser) => {
            if (!active) return;
            setUser(nextUser);
            setAuthReady(true);
          },
          () => {
            if (!active) return;
            setUser(null);
            setAuthReady(true);
          },
        );
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setAuthReady(true);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const register = useCallback((email, password, profile = {}) => runAuthAction(async () => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    savePendingRegistrationAvatar(credential.user.uid, profile.avatarId);
    await sendEmailVerification(credential.user);
    return credential.user;
  }), []);

  const login = useCallback((email, password) => runAuthAction(async () => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    return credential.user;
  }), []);

  const loginWithGoogle = useCallback(() => runAuthAction(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const credential = await signInWithPopup(auth, provider);
      return credential.user;
    } catch (error) {
      if (error?.code !== 'auth/popup-blocked') throw error;
      await signInWithRedirect(auth, provider);
      return null;
    }
  }), []);

  const resetPassword = useCallback((email) => runAuthAction(async () => {
    await sendPasswordResetEmail(auth, email.trim());
    return true;
  }), []);

  const resendVerification = useCallback(() => runAuthAction(async () => {
    const currentUser = auth.currentUser ?? user;
    if (!currentUser) throw createAuthError('auth/no-current-user');
    if (currentUser.emailVerified) return false;
    await sendEmailVerification(currentUser);
    return true;
  }), [user]);

  const refreshVerification = useCallback(() => runAuthAction(async () => {
    const currentUser = auth.currentUser ?? user;
    if (!currentUser) throw createAuthError('auth/no-current-user');
    await reload(currentUser);
    await currentUser.getIdToken?.(true);
    setUser(auth.currentUser ?? currentUser);
    setAuthRevision((value) => value + 1);
    return currentUser.emailVerified === true;
  }), [user]);

  const logout = useCallback(() => runAuthAction(async () => {
    await signOut(auth);
    return true;
  }), []);

  const value = useMemo(() => ({
    user,
    authReady,
    authRevision,
    isAuthenticated: Boolean(user),
    isEmailVerified: Boolean(user?.emailVerified),
    authAvailable: firebaseConfigured,
    register,
    login,
    loginWithGoogle,
    resetPassword,
    resendVerification,
    refreshVerification,
    logout,
  }), [
    authReady,
    login,
    loginWithGoogle,
    logout,
    register,
    refreshVerification,
    resendVerification,
    resetPassword,
    user,
    authRevision,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// AuthProvider and its companion hook intentionally share one public module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider.');
  return context;
}
