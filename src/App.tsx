import { useEffect, useState } from "react";
import { LoginScreen, RegisterScreen } from "./components/AuthScreens";
import { MainScreen } from "./components/MainScreen";
import { Shell } from "./components/Shell";
import { getLocalizedErrorMessage, getTranslator } from "./i18n";
import { I18nProvider } from "./i18n/react";
import { loginWithSupabase, logoutFromSupabase, registerWithSupabase } from "./lib/auth";
import { loadStoredState, saveStoredState } from "./lib/storage";
import { getActiveTabHostname } from "./lib/tabs";
import { normalizeUpdateState, requestUpdateCheck } from "./lib/updates";
import { touchUserProfile } from "./lib/userProfiles";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STORED_STATE,
  DEFAULT_UPDATE_STATE,
  normalizeSettings,
  type AuthSession,
  type LoginCredentials,
  type RegisterCredentials,
  type Settings,
  type StoredState,
  type UpdateState,
  type UserProfile,
  type ViewName
} from "./types";

export async function getAuthenticatedUserState(authSession: AuthSession, moodleDomain: string | null) {
  try {
    return await touchUserProfile(authSession, moodleDomain);
  } catch (error) {
    console.warn("ReduxShare auth: profile sync failed", {
      userId: authSession.user.id,
      moodleDomain,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      authSession,
      userProfile: null
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
  const t = getTranslator(settings.language);

  useEffect(() => {
    let cancelled = false;

    loadStoredState().then((storedState) => {
      if (cancelled) {
        return;
      }

      const nextState: StoredState = {
        ...DEFAULT_STORED_STATE,
        ...storedState,
        settings: normalizeSettings(storedState.settings),
        authSession: storedState.authSession ?? null,
        userProfile: storedState.userProfile ?? null,
        updateState: normalizeUpdateState(storedState.updateState)
      };

      setSettings(nextState.settings);
      setAuthSession(nextState.authSession);
      setUserProfile(nextState.userProfile);
      setUpdateState(nextState.updateState ?? DEFAULT_UPDATE_STATE);
      setView(nextState.authSession ? "main" : "login");
      setHydrated(true);
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
              error: response.error ?? t("errors.updateCheckFailed")
            })
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
  }, [hydrated]);

  async function handleLogin(credentials: LoginCredentials) {
    setLoginError(null);

    if (!credentials.email || !credentials.password) {
      setLoginError(t("auth.validation.login"));
      return;
    }

    setIsLoginLoading(true);

    try {
      const nextSession = await loginWithSupabase(credentials);
      const moodleDomain = await getActiveTabHostname();
      const { authSession: refreshedSession, userProfile: nextProfile } = await getAuthenticatedUserState(nextSession, moodleDomain);

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
      const result = await registerWithSupabase(credentials);

      if (!result.authSession) {
        setRegisterMessage(result.messageKey ? t(result.messageKey) : t("auth.register.created"));
        return;
      }

      const moodleDomain = await getActiveTabHostname();
      const { authSession: refreshedSession, userProfile: nextProfile } = await getAuthenticatedUserState(
        result.authSession,
        moodleDomain
      );

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
    void logoutFromSupabase(authSession);
    setAuthSession(null);
    setUserProfile(null);
    setLoginError(null);
    setRegisterMessage(null);
    setView("login");
  }

  async function handleCheckUpdates() {
    setIsCheckingUpdates(true);
    setUpdateState((currentState) => normalizeUpdateState({ ...currentState, status: "checking", error: null }));

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
            error: response.error ?? t("errors.updateCheckFailed")
          })
        );
      }
    } finally {
      setIsCheckingUpdates(false);
    }
  }

  return (
    <I18nProvider language={settings.language}>
      <Shell extensionEnabled={settings.extensionEnabled} accentColor={settings.accentColor} updateState={updateState}>
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
          <MainScreen
            settings={settings}
            updateState={updateState}
            isCheckingUpdates={isCheckingUpdates}
            onSettingsChange={setSettings}
            onCheckUpdates={handleCheckUpdates}
            onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
            onLogout={handleLogout}
          />
        )}
      </Shell>
    </I18nProvider>
  );
}
