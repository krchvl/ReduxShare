import { useState } from "react";
import { useI18n } from "../i18n/react";
import type { LoginCredentials, RegisterCredentials } from "../types";
import { Button } from "./Button";
import { TextField } from "./TextField";

interface LoginScreenProps {
  isLoading: boolean;
  errorMessage: string | null;
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  onOpenRegister: () => void;
}

export function LoginScreen({ isLoading, errorMessage, onLogin, onOpenRegister }: LoginScreenProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onLogin({ email: email.trim(), password });
    } finally {
      setPassword("");
    }
  }

  return (
    <form className="auth-form auth-form--login" onSubmit={handleSubmit}>
      <TextField
        label={t("auth.email")}
        type="email"
        value={email}
        autoComplete="email"
        disabled={isLoading}
        required
        onChange={setEmail}
      />
      <TextField
        label={t("auth.password")}
        type="password"
        value={password}
        autoComplete="current-password"
        disabled={isLoading}
        required
        onChange={setPassword}
      />
      <div className="auth-actions auth-actions--login">
        {errorMessage && <p className="auth-message">{errorMessage}</p>}
        <Button className="auth-button" type="submit" disabled={isLoading}>
          {isLoading ? t("auth.login.loading") : t("auth.login.submit")}
        </Button>
        <Button className="auth-button" type="button" variant="outline" disabled={isLoading} onClick={onOpenRegister}>
          {t("auth.register.open")}
        </Button>
      </div>
    </form>
  );
}

interface RegisterScreenProps {
  isLoading: boolean;
  message: string | null;
  onRegister: (credentials: RegisterCredentials) => Promise<void>;
  onOpenLogin: () => void;
}

export function RegisterScreen({ isLoading, message, onRegister, onOpenLogin }: RegisterScreenProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onRegister({ email: email.trim(), username: username.trim(), password });
    } finally {
      setPassword("");
    }
  }

  return (
    <form className="auth-form auth-form--register" onSubmit={handleSubmit}>
      <TextField
        label={t("auth.email")}
        type="email"
        value={email}
        autoComplete="email"
        disabled={isLoading}
        required
        onChange={setEmail}
      />
      <TextField
        label={t("auth.username")}
        value={username}
        autoComplete="username"
        disabled={isLoading}
        required
        onChange={setUsername}
      />
      <TextField
        label={t("auth.password")}
        type="password"
        value={password}
        autoComplete="new-password"
        disabled={isLoading}
        required
        onChange={setPassword}
      />
      <div className="auth-actions auth-actions--register">
        {message && <p className="auth-message">{message}</p>}
        <Button className="auth-button" type="submit" disabled={isLoading}>
          {isLoading ? t("auth.register.loading") : t("auth.register.submit")}
        </Button>
        <Button className="auth-button" type="button" variant="outline" disabled={isLoading} onClick={onOpenLogin}>
          {t("auth.login.open")}
        </Button>
      </div>
    </form>
  );
}
