import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen, RegisterScreen } from "./components/AuthScreens";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/Shell";
import { getLocalizedErrorMessage, getTranslator } from "./i18n";
import { I18nProvider } from "./i18n/react";
import { logout, requestLogin, requestRegister } from "./lib/auth";
import { isAuthSessionForProvider, isFirebaseBackend } from "./lib/envConfig";
import { setActivePocketBaseUrl } from "./lib/pocketbase";
import { loadStoredState, patchStoredState, type StoredStatePatch } from "./lib/storage";
import { getActiveTabHostname } from "./lib/tabs";
import { normalizeUpdateState, requestUpdateCheck } from "./lib/updates";
import { requestTouchUserProfile } from "./lib/userProfiles";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STORED_STATE,
  DEFAULT_UPDATE_STATE,
  normalizePopupState,
  normalizeSettings,
  resolveColorScheme,
  type AuthSession,
  type LoginCredentials,
  type PopupState,
  type RegisterCredentials,
  type Settings,
  type StoredState,
  type UpdateState,
  type UserProfile,
  type ViewName,
} from "./types";

const MainScreen = lazy(() =>
  import("./components/MainScreen").then((module) => ({ default: module.MainScreen })),
);

interface UserProfileSeed {
  email?: string | null;
  username?: string | null;
}

export async function getAuthenticatedUserState(
  authSession: AuthSession,
  moodleDomain: string | null,
  seed: UserProfileSeed = {},
) {
  try {
    const response = await requestTouchUserProfile(authSession, moodleDomain, seed);

    if (!response.ok || !response.authSession || !response.userProfile) {
      console.warn("ReduxShare auth: profile sync failed", {
        userId: authSession.user.id,
        moodleDomain,
        error: response.error ?? "background returned no profile",
      });

      return {
        authSession,
        userProfile: null,
      };
    }

    return {
      authSession: response.authSession,
      userProfile: response.userProfile,
    };
  } catch (error) {
    console.warn("ReduxShare auth: profile sync failed", {
      userId: authSession.user.id,
      moodleDomain,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      authSession,
      userProfile: null,
    };
  }
}

export function App() {
  const [view, setView] = useState<ViewName>("login");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(DEFAULT_UPDATE_STATE);
  const [popupState, setPopupState] = useState<PopupState | null>(null);
  const persistedSnapshotRef = useRef<{
    settings: Settings;
    authSession: AuthSession | null;
    userProfile: UserProfile | null;
  } | null>(null);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [, setSystemSchemeTick] = useState(0);
  const t = useMemo(() => getTranslator(settings.language), [settings.language]);
  const colorScheme = resolveColorScheme(settings.colorScheme);

  useEffect(() => {
    document.documentElement.dataset.theme = colorScheme;
  }, [colorScheme]);

  useEffect(() => {
    if (
      settings.colorScheme !== "system" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const handleChange = () => setSystemSchemeTick((tick) => tick + 1);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    return undefined;
  }, [settings.colorScheme]);

  useEffect(() => {
    let cancelled = false;

    loadStoredState()
      .then((storedState) => {
        if (cancelled) {
          return;
        }

        const providerSession = isAuthSessionForProvider(storedState.authSession)
          ? (storedState.authSession ?? null)
          : null;

        const nextState: StoredState = {
          ...DEFAULT_STORED_STATE,
          ...storedState,
          settings: normalizeSettings(storedState.settings),
          authSession: providerSession,
          userProfile: providerSession ? (storedState.userProfile ?? null) : null,
          updateState: normalizeUpdateState(storedState.updateState),
          popupState: normalizePopupState(storedState.popupState),
        };

        setSettings(nextState.settings);
        setPopupState(nextState.popupState ?? null);
        setAuthSession(nextState.authSession);
        setUserProfile(nextState.userProfile);
        setUpdateState(nextState.updateState ?? DEFAULT_UPDATE_STATE);
        setView(nextState.authSession ? "main" : "login");
        setHydrated(true);
      })
      .catch((error: unknown) => {
        console.warn("ReduxShare auth: stored state hydration failed", { error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const previousState = persistedSnapshotRef.current;
    persistedSnapshotRef.current = { settings, authSession, userProfile };

    const patch: StoredStatePatch = {};

    if (!previousState || previousState.settings !== settings) {
      patch.settings = settings;
    }

    if (!previousState || previousState.authSession !== authSession) {
      patch.authSession = authSession;
    }

    if (!previousState || previousState.userProfile !== userProfile) {
      patch.userProfile = userProfile;
    }

    if (Object.keys(patch).length > 0) {
      void patchStoredState(patch);
    }
  }, [authSession, hydrated, settings, userProfile]);

  useEffect(() => {
    if (isFirebaseBackend()) {
      return;
    }

    const activeServer =
      settings.servers.find((server) => server.id === settings.activeServerId) ??
      settings.servers[0];
    setActivePocketBaseUrl(activeServer?.url ?? null);
  }, [settings.servers, settings.activeServerId]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    let cancelled = false;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch status flag for the update check
    setIsCheckingUpdates(true);

    requestUpdateCheck({ force: false, reason: "popup" })
      .then((response) => {
        if (!cancelled && response.updateState) {
          setUpdateState(response.updateState);
          return;
        }

        if (!cancelled && !response.ok) {
          setUpdateState((currentState) =>
            normalizeUpdateState({
              ...currentState,
              status: "error",
              checkedAt: new Date().toISOString(),
              error: response.error ?? t("errors.updateCheckFailed"),
            }),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUpdateState((currentState) =>
            normalizeUpdateState({
              ...currentState,
              status: "error",
              checkedAt: new Date().toISOString(),
              error: t("errors.updateCheckFailed"),
            }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingUpdates(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, t]);

  async function handleLogin(credentials: LoginCredentials) {
    setLoginError(null);

    if (!credentials.email || !credentials.password) {
      setLoginError(t("auth.validation.login"));
      return;
    }

    setIsLoginLoading(true);

    try {
      const loginResponse = await requestLogin(credentials);

      if (!loginResponse.ok || !loginResponse.authSession) {
        setLoginError(loginResponse.error ?? t("errors.loginGeneric"));
        return;
      }

      const moodleDomain = await getActiveTabHostname();
      const { authSession: refreshedSession, userProfile: nextProfile } =
        await getAuthenticatedUserState(loginResponse.authSession, moodleDomain, {
          email: credentials.email,
        });

      setAuthSession(refreshedSession);
      setUserProfile(nextProfile);
      setView("main");
    } catch (error) {
      setLoginError(getLocalizedErrorMessage(error, t, "errors.loginGeneric"));
    } finally {
      setIsLoginLoading(false);
    }
  }

  async function handleRegister(credentials: RegisterCredentials) {
    setRegisterMessage(null);

    if (!credentials.email || !credentials.username || !credentials.password) {
      setRegisterMessage(t("auth.validation.register"));
      return;
    }

    setIsRegisterLoading(true);

    try {
      const registerResponse = await requestRegister(credentials);

      if (!registerResponse.ok) {
        setRegisterMessage(registerResponse.error ?? t("errors.registerFailed"));
        return;
      }

      if (!registerResponse.authSession) {
        setRegisterMessage(registerResponse.message ?? t("auth.register.created"));
        return;
      }

      const moodleDomain = await getActiveTabHostname();
      const { authSession: refreshedSession, userProfile: nextProfile } =
        await getAuthenticatedUserState(registerResponse.authSession, moodleDomain, {
          email: credentials.email,
          username: credentials.username,
        });

      setAuthSession(refreshedSession);
      setUserProfile(nextProfile);
      setView("main");
    } catch (error) {
      setRegisterMessage(getLocalizedErrorMessage(error, t, "errors.registerFailed"));
    } finally {
      setIsRegisterLoading(false);
    }
  }

  function handleLogout() {
    const hadSession = Boolean(authSession);

    void logout(authSession);
    setAuthSession(null);
    setUserProfile(null);
    setLoginError(null);
    setRegisterMessage(null);

    if (hadSession) {
      setView("login");
    }
  }

  function handleContinueAsGuest() {
    setLoginError(null);
    setRegisterMessage(null);
    setView("main");
  }

  async function handleCheckUpdates() {
    setIsCheckingUpdates(true);
    setUpdateState((currentState) =>
      normalizeUpdateState({ ...currentState, status: "checking", error: null }),
    );

    try {
      const response = await requestUpdateCheck({ force: true, reason: "manual" });

      if (response.updateState) {
        setUpdateState(response.updateState);
      } else if (!response.ok) {
        setUpdateState((currentState) =>
          normalizeUpdateState({
            ...currentState,
            status: "error",
            checkedAt: new Date().toISOString(),
            error: response.error ?? t("errors.updateCheckFailed"),
          }),
        );
      }
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  return (
    <I18nProvider language={settings.language}>
      <ErrorBoundary>
        <Shell
          extensionEnabled={settings.extensionEnabled}
          accentColor={settings.accentColor}
          updateState={updateState}
          popupOpacity={settings.popupOpacity}
        >
          {view === "login" && (
            <LoginScreen
              isLoading={isLoginLoading}
              errorMessage={loginError}
              onLogin={handleLogin}
              onOpenRegister={() => setView("register")}
              onContinueAsGuest={handleContinueAsGuest}
            />
          )}
          {view === "register" && (
            <RegisterScreen
              isLoading={isRegisterLoading}
              message={registerMessage}
              onRegister={handleRegister}
              onOpenLogin={() => setView("login")}
            />
          )}
          {view === "main" && (
            <Suspense fallback={null}>
              <MainScreen
                settings={settings}
                updateState={updateState}
                isCheckingUpdates={isCheckingUpdates}
                userProfile={userProfile}
                isAuthenticated={authSession !== null}
                popupState={popupState}
                onSettingsChange={setSettings}
                onPopupStateChange={setPopupState}
                onCheckUpdates={handleCheckUpdates}
                onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
                onLogout={handleLogout}
                onOpenLogin={() => setView("login")}
              />
            </Suspense>
          )}
        </Shell>
      </ErrorBoundary>
    </I18nProvider>
  );
}
