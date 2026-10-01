import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "../i18n/react";
import type { TranslationKey } from "../i18n";
import { BUILTIN_SERVER_ID } from "../lib/envConfig";
import { measurePocketBasePing, pingStatusForLatency } from "../lib/pocketbase";
import { requestBroadHostPermission } from "../lib/optionalPermissions";
import type { Settings } from "../types";
import { CustomSelect, type CustomSelectOption } from "./CustomSelect";

interface ServerPickerProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onLogout: () => void;
}

const PING_STATUS_COLORS = {
  good: "#4ade80",
  warn: "#ffd166",
  bad: "#f87171",
  offline: "#8a8f9e",
} as const;

function PingBadge({ latencyMs }: { latencyMs: number | null | undefined }) {
  const { t } = useI18n();
  const isMeasuring = latencyMs === undefined;
  const status = latencyMs === undefined ? "offline" : pingStatusForLatency(latencyMs);
  const color = PING_STATUS_COLORS[status];
  const text =
    latencyMs === undefined
      ? "…"
      : latencyMs === null
        ? t("settings.server.offline")
        : `${latencyMs} ${t("settings.server.ms")}`;

  return (
    <span className="ping-badge">
      <span
        className={`ping-badge__dot ${isMeasuring ? "ping-badge__dot--measuring" : ""}`.trim()}
        style={{
          backgroundColor: color,
          boxShadow: isMeasuring ? "none" : `0 0 6px ${color}66`,
        }}
      />
      <span>{text}</span>
    </span>
  );
}

export function ServerPicker({ settings, onSettingsChange, onLogout }: ServerPickerProps) {
  const { t } = useI18n();
  const [latencyById, setLatencyById] = useState<Record<string, number | null | undefined>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [addErrorKey, setAddErrorKey] = useState<TranslationKey | null>(null);

  const measureAllPings = useCallback(() => {
    for (const server of settings.servers) {
      setLatencyById((prev) => ({ ...prev, [server.id]: undefined }));

      void measurePocketBasePing(server.url).then((latency) => {
        setLatencyById((prev) => ({ ...prev, [server.id]: latency }));
      });
    }
  }, [settings.servers]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс статуса пинга перед повторным измерением
    measureAllPings();
  }, [measureAllPings]);

  function patchSettings(patch: Partial<Settings>) {
    onSettingsChange({ ...settings, ...patch });
  }

  function handleSelectServer(serverId: string) {
    if (serverId === settings.activeServerId) {
      return;
    }

    onLogout();
    patchSettings({ activeServerId: serverId });
  }

  async function handleAddServer(event: FormEvent) {
    event.preventDefault();

    const raw = draftUrl.trim();

    if (!raw) {
      return;
    }

    let normalizedUrl: string;
    let origin: string;

    try {
      const parsed = new URL(raw);

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }

      normalizedUrl = raw.replace(/\/+$/, "");
      origin = parsed.origin;
    } catch {
      setAddErrorKey("settings.server.addInvalid");
      return;
    }

    const isDuplicate = settings.servers.some((server) => {
      try {
        return new URL(server.url).origin === origin;
      } catch {
        return false;
      }
    });

    if (isDuplicate) {
      setAddErrorKey("settings.server.addDuplicate");
      return;
    }

    const granted = await requestBroadHostPermission();

    if (!granted) {
      setAddErrorKey("settings.server.addDenied");
    }

    const id = `srv-${Date.now().toString(36)}`;
    const label = new URL(normalizedUrl).hostname;

    onLogout();
    setIsAdding(false);
    setDraftUrl("");
    patchSettings({
      servers: [...settings.servers, { id, url: normalizedUrl, label }],
      activeServerId: id,
    });
  }

  function handleRemoveServer(serverId: string) {
    const server = settings.servers.find((item) => item.id === serverId);

    if (!server || server.builtIn) {
      return;
    }

    const nextServers = settings.servers.filter((item) => item.id !== serverId);
    const wasActive = settings.activeServerId === serverId;

    if (wasActive) {
      onLogout();
    }

    patchSettings({
      servers: nextServers,
      activeServerId: wasActive
        ? (nextServers[0]?.id ?? BUILTIN_SERVER_ID)
        : settings.activeServerId,
    });
  }

  if (settings.servers.length === 0) {
    return <span className="server-picker__missing">{t("settings.server.missing")}</span>;
  }

  const options: CustomSelectOption[] = settings.servers.map((server) => ({
    value: server.id,
    label: server.label,
    description:
      server.builtIn && server.url ? `${server.url} · ${t("settings.server.builtIn")}` : server.url,
    meta: <PingBadge latencyMs={latencyById[server.id]} />,
  }));

  return (
    <CustomSelect
      className="server-picker__select"
      value={settings.activeServerId}
      options={options}
      onChange={handleSelectServer}
      ariaLabel={t("settings.server.title")}
      listLabel={t("settings.server.list")}
      listboxMinWidth={300}
      onOpen={measureAllPings}
      renderOptionTrailing={(option) => {
        const server = settings.servers.find((item) => item.id === option.value);

        if (!server || server.builtIn) {
          return null;
        }

        return (
          <button
            type="button"
            className="cselect__remove-option"
            aria-label={t("settings.server.remove")}
            onClick={(event) => {
              event.stopPropagation();
              handleRemoveServer(server.id);
            }}
          >
            ✕
          </button>
        );
      }}
      footer={
        <div className="server-picker__footer">
          {isAdding ? (
            <form className="cselect__add-form" onSubmit={(event) => void handleAddServer(event)}>
              <input
                className="cselect__add-input"
                type="text"
                value={draftUrl}
                placeholder={t("settings.server.addPlaceholder")}
                autoFocus
                onChange={(event) => {
                  setDraftUrl(event.target.value);
                  setAddErrorKey(null);
                }}
              />
              <button type="submit" className="cselect__add-button">
                {t("settings.server.addAction")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="cselect__add-row"
              onClick={() => {
                setIsAdding(true);
                setDraftUrl("");
                setAddErrorKey(null);
              }}
            >
              + {t("settings.server.add")}
            </button>
          )}
          {addErrorKey ? <p className="cselect__error">{t(addErrorKey)}</p> : null}
        </div>
      }
    />
  );
}
