import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore, boot, applyHash, flushPending, currentThemeId } from './lib/store';
import { applyTheme, isSafeMode, exitSafeMode } from './lib/theme';
import { loadTokenizer } from './lib/tokenizer';
import { openChat } from './lib/generate';
import { Rail, BottomNav, Backdrop, Toasts } from './components/Shell';
import { DialogHost } from './components/ui';
import { ChatPage } from './pages/chat/ChatPage';
import { loadExtensions } from './lib/extensions';
import { Icon } from './components/Icon';

const LibraryPage = lazy(() => import('./pages/library/LibraryPage'));
const PresetsPage = lazy(() => import('./pages/presets/PresetsPage'));
const GeneratorPage = lazy(() => import('./pages/generator/GeneratorPage'));
const MemoryPage = lazy(() => import('./pages/memory/MemoryPage'));
const ImagesPage = lazy(() => import('./pages/images/ImagesPage'));
const RegexPage = lazy(() => import('./pages/regex/RegexPage'));
const ModulesPage = lazy(() => import('./pages/modules/ModulesPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

function useThemeSync() {
  const themeId = useStore(currentThemeId);
  // Re-evaluate «auto» day/night every few minutes.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  const theme = useStore((s) => s.themes.find((t) => t.id === themeId) || s.themes[0]);
  const customCss = useStore((s) => s.settings.theme.customCss);
  useEffect(() => {
    if (theme) applyTheme(theme, { customCss });
  }, [theme, customCss]);
}

export function App() {
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const route = useStore((s) => s.route);
  const tokenizer = useStore((s) => s.settings.tokenizer);
  useThemeSync();

  useEffect(() => {
    applyHash();
    window.addEventListener('popstate', applyHash);
    window.addEventListener('hashchange', applyHash);
    const onHide = () => document.visibilityState === 'hidden' && flushPending();
    document.addEventListener('visibilitychange', onHide);
    boot().then(async () => {
      const s = useStore.getState();
      if (s.settings.activeChatId) await openChat(s.settings.activeChatId).catch(() => {});
      loadExtensions().catch((err) => console.warn('[extensions]', err));
    });
    return () => {
      window.removeEventListener('popstate', applyHash);
      window.removeEventListener('hashchange', applyHash);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  useEffect(() => {
    if (ready) loadTokenizer(tokenizer);
  }, [ready, tokenizer]);

  if (bootError) {
    return (
      <div className="cs-boot">
        <img src="./cream-soda-icon.svg" width="96" height="96" alt="" />
        <strong style={{ color: 'var(--cs-text)', fontSize: 18 }}>Не удалось подключиться к серверу</strong>
        <span>{bootError}</span>
        <button type="button" className="cs-btn cs-btn--primary" onClick={() => location.reload()}>
          Попробовать снова
        </button>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="cs-boot" role="status">
        <img src="./cream-soda-icon-animated.svg" width="120" height="120" alt="" />
        <span>Наливаю крем-соду…</span>
      </div>
    );
  }

  return (
    <div className="cs-app">
      <Backdrop />
      <Rail />
      <div className="cs-app__main">
        {isSafeMode() ? (
          <div className="cs-safe-banner">
            <Icon name="warn" size={16} />
            Безопасный режим: свой CSS отключён.
            <button
              type="button"
              className="cs-btn cs-btn--xs"
              onClick={() => {
                exitSafeMode();
                location.href = location.pathname + location.hash;
              }}
            >
              Выйти
            </button>
          </div>
        ) : null}
        <Suspense
          fallback={
            <div className="cs-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
              <span className="cs-spinner" />
            </div>
          }
        >
          {route === 'chat' && <ChatPage />}
          {route === 'library' && <LibraryPage />}
          {route === 'presets' && <PresetsPage />}
          {route === 'generator' && <GeneratorPage />}
          {route === 'memory' && <MemoryPage />}
          {route === 'images' && <ImagesPage />}
          {route === 'regex' && <RegexPage />}
          {route === 'modules' && <ModulesPage />}
          {route === 'settings' && <SettingsPage />}
        </Suspense>
      </div>
      <BottomNav />
      <Toasts />
      <DialogHost />
    </div>
  );
}
