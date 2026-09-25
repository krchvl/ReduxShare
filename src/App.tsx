import { Suspense, lazy, useEffect, useState } from "react";
import { LoginScreen, RegisterScreen } from "./components/AuthScreens";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Shell } from "./components/Shell";
import { getLocalizedErrorMessage, getTranslator } from "./i18n";
import { I18nProvider } from "./i18n/react";
import { loginWithPocketBase, logoutFromPocketBase, registerWithPocketBase } from "./lib/auth";
import { loadStoredState, saveStoredState } from "./lib/storage";
import { getActiveTabHostname } from "./lib/tabs";
import { normalizeUpdateState, requestUpdateCheck } from "./lib/updates";
import { touchUserProfile } from "./lib/userProfiles";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STORED_STATE,
  DEFAULT_UPDATE_STATE,
  normalizeSettings,
  resolveColorScheme,
  type AuthSession,
  type LoginCredentials,
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
    return await touchUserProfile(authSession, moodleDomain, seed);
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
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [, setSystemSchemeTick] = useState(0);
  const t = getTranslator(settings.language);
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

        const nextState: StoredState = {
          ...DEFAULT_STORED_STATE,
          ...storedState,
          settings: normalizeSettings(storedState.settings),
          authSession: storedState.authSession ?? null,
          userProfile: storedState.userProfile ?? null,
          updateState: normalizeUpdateState(storedState.updateState),
        };

        setSettings(nextState.settings);
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

    void saveStoredState({ settings, authSession, userProfile });
  }, [authSession, hydrated, settings, userProfile]);

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
      const nextSession = await loginWithPocketBase(credentials);
      const moodleDomain = await getActiveTabHostname();
      const { authSession: refreshedSession, userProfile: nextProfile } =
        await getAuthenticatedUserState(nextSession, moodleDomain, {
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
      const result = await registerWithPocketBase(credentials);

      if (!result.authSession) {
        setRegisterMessage(result.messageKey ? t(result.messageKey) : t("auth.register.created"));
        return;
      }

      const moodleDomain = await getActiveTabHostname();
      const { authSession: refreshedSession, userProfile: nextProfile } =
        await getAuthenticatedUserState(result.authSession, moodleDomain, {
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
    void logoutFromPocketBase(authSession);
    setAuthSession(null);
    setUserProfile(null);
    setLoginError(null);
    setRegisterMessage(null);
    setView("login");
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
                onSettingsChange={setSettings}
                onCheckUpdates={handleCheckUpdates}
                onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
                onLogout={handleLogout}
              />
            </Suspense>
          )}
        </Shell>
      </ErrorBoundary>
    </I18nProvider>
  );
}
