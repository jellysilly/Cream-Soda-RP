import { useCallback, useEffect, useState } from 'react';
import { useStore, setState, toast, toastError } from '../lib/store';
import { api, type KeyList } from '../lib/api';
import { pickFiles } from '../lib/utils';
import { t, tn } from '../lib/i18n';
import { Check, Field, Modal, confirmDialog } from './ui';
import { Icon } from './Icon';

/** Keeps the masked active key in the store in step with the server. */
function applyMasked(slot: string, masked: string) {
  setState((s) => {
    const secrets = { ...s.secrets };
    if (masked) secrets[slot] = masked;
    else delete secrets[slot];
    return { secrets };
  });
}

/**
 * Several API keys for one slot (a connection profile or the image API): the
 * active one is used for requests, the others wait for a switch by hand or, with
 * rotation on, for the active one to hit a rate limit or run out of credit.
 */
export function KeysButton({ slot, title }: { slot: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const masked = useStore((s) => s.secrets[slot] || '');
  useEffect(() => {
    let alive = true;
    api
      .keyList(slot)
      .then((l) => alive && setCount(l.keys.length))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // The active key changes from the main field too.
  }, [slot, masked, open]);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="cs-btn cs-btn--sm" style={{ minHeight: 46, borderRadius: 14 }} title={t('Saved keys')} onClick={() => setOpen(true)}>
        <Icon name="list" size={16} />
        {count > 1 ? t('Keys · {n}', { n: count }) : t('Keys')}
      </button>
      {open ? <KeysDialog slot={slot} title={title} onClose={close} /> : null}
    </>
  );
}

function KeyRow({ slot, item, index, active, onChange }: { slot: string; item: KeyList['keys'][number]; index: number; active: boolean; onChange: (l: KeyList) => void }) {
  const isLocal = useStore((s) => s.isLocal);
  const [label, setLabel] = useState(item.label);
  const [revealed, setRevealed] = useState('');
  useEffect(() => setLabel(item.label), [item.label]);
  const run = (p: Promise<KeyList>) => p.then(onChange).catch((err) => toastError(err));
  return (
    <div className="cs-key-row" aria-current={active ? 'true' : undefined}>
      <button type="button" role="radio" aria-checked={active} className="cs-key-row__pick" aria-label={t('Use this key')} title={t('Use this key')} onClick={() => !active && run(api.updateKey(slot, item.id, { active: true }))}>
        <span />
      </button>
      <div className="cs-key-row__main">
        <input
          className="cs-input"
          value={label}
          placeholder={t('Key {n}', { n: index + 1 })}
          aria-label={t('Key name')}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== item.label && run(api.updateKey(slot, item.id, { label }))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <code className="cs-key-row__value">{revealed || item.masked}</code>
      </div>
      {isLocal ? (
        <button
          type="button"
          className="cs-icon-btn cs-icon-btn--xs"
          aria-label={revealed ? t('Hide the key') : t('Show the key')}
          onClick={async () => {
            if (revealed) return setRevealed('');
            try {
              setRevealed((await api.revealKey(slot, item.id)).value);
            } catch (err) {
              toastError(err);
            }
          }}
        >
          <Icon name={revealed ? 'eyeOff' : 'eye'} size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className="cs-icon-btn cs-icon-btn--xs"
        aria-label={t('Delete the key')}
        onClick={async () => {
          if (await confirmDialog(t('Delete the key “{name}”?', { name: item.label || t('Key {n}', { n: index + 1 }) }), { ok: t('Delete'), danger: true })) run(api.removeKey(slot, item.id));
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

export function KeysDialog({ slot, title, onClose }: { slot: string; title: string; onClose: () => void }) {
  const [list, setList] = useState<KeyList | null>(null);
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (l: KeyList) => {
      setList(l);
      applyMasked(slot, l.masked);
    },
    [slot],
  );
  useEffect(() => {
    api
      .keyList(slot)
      .then(setList)
      .catch((err) => toastError(err));
  }, [slot]);

  const add = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const r = await api.addKeys(slot, text, label.trim());
      apply(r);
      setValue('');
      setLabel('');
      const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
      toast(r.added ? t('Added: {n} {x}', { n: r.added, x: tn(r.added, 'key|keys') }) + (r.added < lines ? ` · ${t('duplicates skipped: {n}', { n: lines - r.added })}` : '') : t('These keys are already saved'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async () => {
    const [file] = await pickFiles('.txt,.csv,.env,text/plain');
    if (file) add(await file.text());
  };

  const keys = list?.keys || [];
  return (
    <Modal title={t('Keys · {name}', { name: title })} onClose={onClose} footer={<button type="button" className="cs-btn cs-btn--primary" onClick={onClose}>{t('Done')}</button>}>
      <div className="cs-col" style={{ gap: 14 }}>
        {!list ? (
          <span className="cs-spinner" style={{ width: 20, height: 20 }} />
        ) : keys.length ? (
          <div role="radiogroup" aria-label={t('Saved keys')} className="cs-col" style={{ gap: 6 }}>
            {keys.map((k, i) => (
              <KeyRow key={k.id} slot={slot} item={k} index={i} active={k.id === list.active} onChange={apply} />
            ))}
          </div>
        ) : (
          <p className="cs-hint">{t('No keys saved yet.')}</p>
        )}
        {list && keys.length > 1 ? (
          <Check checked={list.rotate} onChange={(rotate) => api.setKeyRotation(slot, rotate).then(apply).catch((err) => toastError(err))}>
            {t('Switch to the next key when the provider answers 401, 402, 403 or 429 (invalid key, no credit, rate limit)')}
          </Check>
        ) : null}
        <Field label={t('Add keys')} hint={t('One key per line: a whole list can be pasted at once. Keys that are already saved are skipped.')}>
          <textarea className="cs-textarea cs-textarea--mono" rows={3} spellCheck={false} autoComplete="off" value={value} placeholder="sk-…" onChange={(e) => setValue(e.target.value)} />
        </Field>
        <div className="cs-row cs-row--wrap" style={{ gap: 8 }}>
          <input className="cs-input cs-grow" style={{ flex: '1 1 180px' }} value={label} maxLength={80} placeholder={t('Name (optional)')} aria-label={t('Key name')} onChange={(e) => setLabel(e.target.value)} />
          <button type="button" className="cs-btn" disabled={busy || !value.trim()} onClick={() => add(value)}>
            <Icon name="plus" size={16} /> {t('Add')}
          </button>
          <button type="button" className="cs-btn" disabled={busy} onClick={fromFile}>
            <Icon name="download" size={16} /> {t('From a file…')}
          </button>
        </div>
        <p className="cs-hint">{t('Keys are stored encrypted on this device. Only the active one is sent with requests.')}</p>
      </div>
    </Modal>
  );
}

