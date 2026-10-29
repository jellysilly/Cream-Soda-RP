import { useStore, navigate, type Route, getState, currentThemeId, isNight } from '../lib/store';
import { Icon, SodaGlass } from './Icon';
import { openMenu } from './ui';
import { toggleNight } from '../lib/appActions';
import { t } from '../lib/i18n';

export const NAV: { route: Route; label: string; icon: string }[] = [
  { route: 'chat', label: t('Chat'), icon: 'chat' },
  { route: 'library', label: t('Chars'), icon: 'chars' },
  { route: 'presets', label: t('Presets'), icon: 'presets' },
  { route: 'generator', label: t('Generator'), icon: 'generator' },
  { route: 'memory', label: t('Memory'), icon: 'memory' },
  { route: 'images', label: t('Images'), icon: 'images' },
  { route: 'regex', label: t('Regexes'), icon: 'regex' },
  { route: 'modules', label: t('Modules'), icon: 'modules' },
  { route: 'settings', label: t('Settings'), icon: 'settings' },
];

function href(route: Route) {
  return `#/${route}`;
}

export function Rail() {
  const route = useStore((s) => s.route);
  const dark = useStore((s) => !!s.themes.find((th) => th.id === currentThemeId(s))?.dark);
  return (
    <nav className="cs-rail" aria-label={t('Sections')}>
      <a className="cs-rail__brand" href={href('chat')} onClick={(e) => (e.preventDefault(), navigate('chat'))}>
        <SodaGlass dark={dark} />
        <span>ソーダ</span>
      </a>
      {NAV.map((n) => (
        <a
          key={n.route}
          href={href(n.route)}
          className="cs-rail__item"
          aria-current={route === n.route ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(n.route);
          }}
        >
          <Icon name={n.icon} size={22} />
          <span>{n.label}</span>
        </a>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const route = useStore((s) => s.route);
  const primary: Route[] = ['chat', 'library', 'memory', 'images'];
  const more = NAV.filter((n) => !primary.includes(n.route));
  const moreActive = !primary.includes(route);
  return (
    <nav className="cs-bottom-nav" aria-label={t('Sections')}>
      {NAV.filter((n) => primary.includes(n.route)).map((n) => (
        <a
          key={n.route}
          href={href(n.route)}
          className="cs-bottom-nav__item"
          aria-current={route === n.route ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate(n.route);
          }}
        >
          <Icon name={n.icon} size={20} />
          {n.label}
        </a>
      ))}
      <button
        type="button"
        className="cs-bottom-nav__item"
        aria-current={moreActive ? 'page' : undefined}
        onClick={(e) =>
          openMenu(e.currentTarget, [
            ...more.map((n) => ({ label: n.label, icon: n.icon, onClick: () => navigate(n.route) })),
            { separator: true, label: '' },
            {
              label: isNight(getState()) ? t('Day theme') : t('Night theme'),
              icon: isNight(getState()) ? 'sun' : 'moon',
              onClick: toggleNight,
            },
          ])
        }
      >
        <Icon name="dots" size={20} />
        {t('More')}
      </button>
    </nav>
  );
}

export function Backdrop() {
  const chatBg = useStore((s) => s.chat?.meta.background);
  const sceneBg = useStore((s) => s.chat?.meta.sceneImage);
  const theme = useStore((s) => s.themes.find((th) => th.id === currentThemeId(s)));
  const route = useStore((s) => s.route);
  let image = '';
  if (route === 'chat') {
    if (chatBg) image = chatBg;
    else if (theme?.background === 'image' && theme.backgroundImage) image = theme.backgroundImage;
    else if (theme?.background === 'scene' && sceneBg) image = sceneBg;
  } else if (theme?.background === 'image' && theme.backgroundImage) image = theme.backgroundImage;
  return (
    <div className="cs-backdrop" aria-hidden="true">
      {image ? <div className="cs-backdrop__image" style={{ backgroundImage: `url("${image}")` }} /> : null}
      <div className="cs-backdrop__blob" style={{ left: -140, top: 420, width: 320, height: 320 }} />
      <div className="cs-backdrop__blob" style={{ right: -120, top: 80, width: 380, height: 380 }} />
      <div className="cs-backdrop__pair" style={{ right: '22%', top: -40, width: 200, height: 160 }}>
        <div className="cs-backdrop__orb cs-backdrop__orb--pink" style={{ left: 0, top: 30, width: 110, height: 110 }} />
        <div className="cs-backdrop__orb cs-backdrop__orb--pink" style={{ left: 70, top: 0, width: 120, height: 120 }} />
      </div>
      <div className="cs-backdrop__pair" style={{ left: 40, bottom: -60, width: 220, height: 170, animationDuration: '9s' }}>
        <div className="cs-backdrop__orb cs-backdrop__orb--blue" style={{ left: 0, top: 20, width: 110, height: 110 }} />
        <div className="cs-backdrop__orb cs-backdrop__orb--blue" style={{ left: 80, top: 0, width: 100, height: 100 }} />
      </div>
      <svg className="cs-backdrop__star" width="18" height="18" viewBox="0 0 24 24" style={{ left: '34%', top: 40 }}>
        <path d="M12 3c.7 5 2.9 7.2 8 8-5.1.8-7.3 3-8 8-.7-5-2.9-7.2-8-8 5.1-.8 7.3-3 8-8z" />
      </svg>
      <svg className="cs-backdrop__star" width="12" height="12" viewBox="0 0 24 24" style={{ left: '58%', top: 96, animationDuration: '4s', animationDelay: '1s' }}>
        <path d="M12 3c.7 5 2.9 7.2 8 8-5.1.8-7.3 3-8 8-.7-5-2.9-7.2-8-8 5.1-.8 7.3-3 8-8z" />
      </svg>
      <svg className="cs-backdrop__star" width="14" height="14" viewBox="0 0 24 24" style={{ right: 60, top: 620, animationDuration: '5s', animationDelay: '2s' }}>
        <path d="M12 3c.7 5 2.9 7.2 8 8-5.1.8-7.3 3-8 8-.7-5-2.9-7.2-8-8 5.1-.8 7.3-3 8-8z" />
      </svg>
      <svg className="cs-backdrop__grain">
        <filter id="cs-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#cs-grain)" />
      </svg>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="cs-toasts" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`cs-toast cs-toast--${item.kind}`}>
          <span className="cs-dot" style={{ marginTop: 5 }} />
          <p>{item.text}</p>
        </div>
      ))}
    </div>
  );
}
