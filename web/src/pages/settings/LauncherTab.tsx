import { useEffect, useState } from 'react';
import { useStore, toast, toastError } from '../../lib/store';
import { Kana } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { api } from '../../lib/api';
import type { SystemInfo } from '../../lib/types';
import { copyText, fmtTime } from '../../lib/utils';

export function LauncherTab() {
  const version = useStore((s) => s.version);
  const isLocal = useStore((s) => s.isLocal);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [logs, setLogs] = useState<{ time: number; level: string; text: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.system().then(setInfo).catch((e) => toastError(e));
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="cs-columns">
      <section className="cs-panel cs-panel--strong cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <div className="cs-row">
          <span className="cs-pill cs-pill--mint cs-pill--lg">
            <span className="cs-dot cs-dot--sm" />
            Сервер работает
          </span>
          <span className="cs-mono cs-ml-auto" style={{ fontSize: 12, color: 'var(--cs-muted)' }}>
            v{version}
          </span>
        </div>
        <div className="cs-row" style={{ gap: 12, alignItems: 'center', padding: 12, borderRadius: 20, background: 'var(--cs-surface-row)' }}>
          {info?.lan.qr ? (
            <div className="cs-qr" aria-label="QR-код для телефона" dangerouslySetInnerHTML={{ __html: info.lan.qr }} />
          ) : (
            <div className="cs-qr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cs-faint)' }}>
              <Icon name="qr" size={40} />
            </div>
          )}
          <div className="cs-grow cs-col" style={{ gap: 4 }}>
            <label className="cs-check cs-check--row" style={{ fontWeight: 800 }}>
              Открыть с телефона
              <input
                type="checkbox"
                checked={!!info?.lan.enabled}
                disabled={!isLocal || busy}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await api.setLan(e.target.checked);
                    await new Promise((r) => setTimeout(r, 400));
                    await load();
                  } catch (err) {
                    toastError(err);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            <span className="cs-mono" style={{ fontSize: 12, color: 'var(--cs-muted)' }}>
              {info?.lan.display || 'нет сети'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--cs-muted)' }}>{info?.lan.enabled ? 'Отсканируй QR-код в той же Wi-Fi сети' : 'Включи, чтобы зайти с телефона в той же Wi-Fi сети'}</span>
            {info?.lan.enabled && info.lan.url ? (
              <button type="button" className="cs-btn cs-btn--xs" style={{ alignSelf: 'flex-start' }} onClick={() => copyText(info.lan.url).then(() => toast('Ссылка скопирована'))}>
                <Icon name="copy" size={14} /> Скопировать ссылку
              </button>
            ) : null}
          </div>
        </div>
        <div className="cs-col" style={{ gap: 4, fontSize: 13 }}>
          <div>
            Профиль данных: <b>{info?.profile}</b>
            {info && info.profiles.length > 1 ? <span className="cs-muted"> · есть ещё: {info.profiles.filter((p) => p !== info.profile).join(', ')}</span> : null}
          </div>
          <div>
            Порт: <b>{info?.port}</b> · {info?.host === '0.0.0.0' ? 'слушает сеть' : 'только этот компьютер'}
          </div>
          {info?.dataRoot ? (
            <div className="cs-ellipsis">
              Данные: <code className="cs-mono" style={{ fontSize: 12 }}>{info.dataRoot}</code>
            </div>
          ) : null}
          {info?.launcher ? <div>Лаунчер: {info.launcher.kind}</div> : <div className="cs-muted">Запущено без лаунчера (npm start).</div>}
        </div>
        <p className="cs-hint">Профили данных, обновление и запуск в отдельном окне — в лаунчере Cream Soda. Сменить профиль можно при запуске: <code className="cs-mono">npm start -- --profile Тестовый</code>.</p>
      </section>
      <section className="cs-panel cs-panel--pad-lg" style={{ flex: '1 1 420px', minWidth: 0 }}>
        <div className="cs-row">
          <h2 className="cs-h2" style={{ fontSize: 17 }}>
            Логи сервера
          </h2>
          <Kana>ログ</Kana>
          <button type="button" className="cs-btn cs-btn--sm cs-ml-auto" disabled={!isLocal} onClick={() => api.logs().then(setLogs).catch((e) => toastError(e))}>
            {logs ? 'Обновить' : 'Показать'}
          </button>
        </div>
        {logs ? (
          <pre className="cs-logs">
            {logs.length ? logs.map((l) => `${fmtTime(l.time)} ${l.level === 'error' ? '✖' : l.level === 'warn' ? '!' : '·'} ${l.text}`).join('\n') : 'Пусто'}
          </pre>
        ) : (
          <p className="cs-hint">Здесь видно, что делает сервер: запросы к моделям, бэкапы, ошибки.</p>
        )}
      </section>
    </div>
  );
}
