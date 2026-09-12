'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PLATFORM_SPECS, PLATFORMS, type Platform } from '@/lib/listing/platforms';
import { CONDITION_LABELS, renderFor, type Listing } from '@/lib/listing/schema';
import type { Quota } from '@/lib/quota';

/**
 * The whole product surface.
 *
 * Two rules shaped it. First, the seller is standing over a pile of clothes
 * holding a phone, so every control is reachable with a thumb and nothing is
 * required except a photo. Second, the output is only useful if it reaches the
 * marketplace, so every field the seller pastes has its own copy button and
 * its own character count - a title that copies clean is the product.
 */

const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'PLN', 'CZK', 'SEK'];

/** Longest edge after downscaling. Detail beyond this changes nothing the
 *  model can use and costs upload seconds on a phone connection. */
const MAX_EDGE = 1400;
const MAX_PHOTOS = 4;

interface Shot {
  id: string;
  preview: string;
  media_type: 'image/jpeg';
  data: string;
}

/** Downscales in the browser: a 12MP phone photo becomes ~250KB before it
 *  ever leaves the device, which is the difference between a listing in
 *  twenty seconds and one in ninety on mobile data. */
async function toShot(file: File): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser will not let the photo be resized.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return {
    id: crypto.randomUUID(),
    preview: dataUrl,
    media_type: 'image/jpeg',
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
  };
}

export function Studio({ quota: initialQuota, signedIn }: { quota: Quota; signedIn: boolean }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>(['ebay']);
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [quota, setQuota] = useState(initialQuota);
  const [active, setActive] = useState<Platform>('ebay');
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const room = MAX_PHOTOS - shots.length;
    const chosen = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    if (chosen.length === 0) return;
    try {
      const added = await Promise.all(chosen.map(toShot));
      setShots((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That photo could not be read.');
    }
  }, [shots.length]);

  function togglePlatform(platform: Platform) {
    setPlatforms((current) => {
      const next = current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform];
      // Never leave nothing selected: the request would fail and the seller
      // would have to work out why the button stopped doing anything.
      return next.length === 0 ? current : next;
    });
  }

  async function submit() {
    if (shots.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setNeedsUpgrade(false);

    try {
      const response = await fetch('/api/listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          photos: shots.map(({ media_type, data }) => ({ media_type, data })),
          platforms,
          currency,
          notes: notes.trim() || null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? 'The listing could not be written.');
        setNeedsUpgrade(Boolean(payload.upgrade));
        if (payload.quota) setQuota(payload.quota);
        return;
      }

      setListing(payload.listing as Listing);
      setQuota(payload.quota as Quota);
      setActive(platforms[0]);
    } catch {
      setError('The connection dropped before the listing came back. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio">
      <div className="stack" style={{ gap: 16 }}>
        <div
          className={`drop${over ? ' over' : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => { event.preventDefault(); setOver(false); void addFiles(event.dataTransfer.files); }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter') fileInput.current?.click(); }}
        >
          <p style={{ fontWeight: 600 }}>{shots.length === 0 ? 'Add a photo of the item' : 'Add another angle'}</p>
          <p className="small faint" style={{ marginTop: 4 }}>
            {shots.length === 0
              ? 'Tap to use the camera, or drop a file. Up to four.'
              : `${shots.length} of ${MAX_PHOTOS}. The label and any damage help most.`}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => { if (event.target.files) void addFiles(event.target.files); event.target.value = ''; }}
          />
        </div>

        {shots.length > 0 && (
          <div className="thumbs">
            {shots.map((shot) => (
              <div key={shot.id} className="thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.preview} alt="" />
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => setShots((current) => current.filter((s) => s.id !== shot.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <span className="field-label">Marketplace</span>
          <div className="choices">
            {PLATFORMS.map((platform) => (
              <button
                key={platform}
                type="button"
                className="choice"
                aria-pressed={platforms.includes(platform)}
                onClick={() => togglePlatform(platform)}
              >
                {PLATFORM_SPECS[platform].label}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="field" style={{ width: 120 }}>
            <label className="field-label" htmlFor="currency">Currency</label>
            <select id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="notes">Anything the photo cannot show (optional)</label>
          <textarea
            id="notes"
            value={notes}
            maxLength={500}
            placeholder="Worn twice. Bought in Berlin 2021. Pit to pit 54cm."
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <button type="button" className="btn btn-primary btn-block" disabled={shots.length === 0 || busy} onClick={submit}>
          {busy ? <><span className="spinner" /> Reading the photo…</> : 'Write the listing'}
        </button>

        {error && (
          <div className="error stack" style={{ gap: 10 }}>
            <span>{error}</span>
            {needsUpgrade && <Link href="/pricing" className="btn btn-primary">Go Pro — unlimited listings</Link>}
          </div>
        )}

        <QuotaBar quota={quota} signedIn={signedIn} />
      </div>

      <div>
        {busy && !listing && <Pending />}
        {!busy && !listing && <Empty />}
        {listing && (
          <Result
            listing={listing}
            platforms={platforms}
            active={platforms.includes(active) ? active : platforms[0]}
            onSelect={setActive}
          />
        )}
      </div>
    </div>
  );
}

function QuotaBar({ quota, signedIn }: { quota: Quota; signedIn: boolean }) {
  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  return (
    <div className="card card-tight stack" style={{ gap: 8 }}>
      <div className="spread">
        <span className="small dim">
          {quota.plan === 'free'
            ? `${quota.remaining} of ${quota.limit} free listings left`
            : `${quota.used} listings this month`}
        </span>
        {quota.plan === 'free'
          ? <Link href="/pricing" className="btn-quiet">Go Pro</Link>
          : <span className="pill pill-accent">Pro</span>}
      </div>
      {quota.plan === 'free' && <div className="meter"><i style={{ width: `${pct}%` }} /></div>}
      {!signedIn && quota.used > 0 && (
        <p className="small faint">
          Saved to this browser. <Link href="/signin" className="accent">Add an email</Link> to keep them.
        </p>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="card stack" style={{ gap: 10, minHeight: 280, justifyContent: 'center', textAlign: 'center' }}>
      <h3>Nothing read yet</h3>
      <p className="dim" style={{ fontSize: 14.5, maxWidth: 380, marginInline: 'auto' }}>
        Add a photo on the left. One is enough to start — a shot of the label and a shot of any damage
        make the difference between a listing and a good one.
      </p>
    </div>
  );
}

function Pending() {
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="skeleton" style={{ height: 18, width: '45%' }} />
      <div className="skeleton" style={{ height: 44 }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 60, width: '70%' }} />
      <p className="small faint">Reading the photo, grading the condition, writing the copy.</p>
    </div>
  );
}

function Copy({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="out-field">
      <div className="out-head">
        <span className="out-label">{label}{hint ? ` · ${hint}` : ''}</span>
        <Copy text={value} />
      </div>
      <div className="out-body">{value}</div>
    </div>
  );
}

function Result({ listing, platforms, active, onSelect }: {
  listing: Listing;
  platforms: Platform[];
  active: Platform;
  onSelect: (platform: Platform) => void;
}) {
  const spec = PLATFORM_SPECS[active];
  const copy = useMemo(() => renderFor(listing, active), [listing, active]);
  const { item, price } = listing;

  return (
    <div className="stack" style={{ gap: 14 }}>
      {platforms.length > 1 && (
        <div className="choices">
          {platforms.map((platform) => (
            <button
              key={platform}
              type="button"
              className="choice"
              aria-pressed={platform === active}
              onClick={() => onSelect(platform)}
            >
              {PLATFORM_SPECS[platform].label}
            </button>
          ))}
        </div>
      )}

      <Field label="Title" value={copy.title} hint={`${copy.title.length}/${spec.titleMax}`} />
      <Field label="Description" value={copy.description} />

      <div className="card stack" style={{ gap: 12 }}>
        <div className="spread">
          <div className="stack" style={{ gap: 2 }}>
            <span className="out-label">Suggested price</span>
            <div className="price-row">
              <span className="price-big">{price.currency} {price.suggested}</span>
              <span className="price-range">{price.low} quick · {price.high} patient</span>
            </div>
          </div>
          <span className={`pill${price.confidence === 'low' ? ' pill-warn' : ''}`}>{price.confidence} confidence</span>
        </div>
        <p className="note small">{price.basis}</p>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <div className="spread">
          <span className="out-label">What it read</span>
          <span className="pill">{CONDITION_LABELS[item.condition]}</span>
        </div>
        <div className="chip-list">
          {item.brand && (
            <span className="chip">
              {item.brand}
              {item.brand_confidence !== 'visible' && <span className="faint"> · {item.brand_confidence}</span>}
            </span>
          )}
          {item.size_on_label && <span className="chip">Size {item.size_on_label}</span>}
          <span className="chip">{item.colour}</span>
          {item.material && <span className="chip">{item.material}</span>}
          {item.era_or_style && <span className="chip">{item.era_or_style}</span>}
        </div>
        {item.flaws.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <span className="out-label">Flaws it found</span>
            <ul className="dim small" style={{ margin: 0, paddingLeft: 18 }}>
              {item.flaws.map((flaw) => <li key={flaw}>{flaw}</li>)}
            </ul>
          </div>
        )}
      </div>

      {listing.ask_the_seller.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="out-label">Only you know this — add it before listing</span>
          <ul className="dim small" style={{ margin: 0, paddingLeft: 18 }}>
            {listing.ask_the_seller.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </div>
      )}

      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Search keywords</span>
          <Copy text={listing.keywords.join(', ')} />
        </div>
        <div className="out-body">
          <div className="chip-list">
            {listing.keywords.map((keyword) => <span key={keyword} className="chip">{keyword}</span>)}
          </div>
        </div>
      </div>

      {copy.hashtags.length > 0 && <Field label={`${spec.label} hashtags`} value={copy.hashtags.join(' ')} />}

      {listing.photo_tips.length > 0 && (
        <div className="card stack" style={{ gap: 8 }}>
          <span className="out-label">Better photos, more money</span>
          <ul className="dim small" style={{ margin: 0, paddingLeft: 18 }}>
            {listing.photo_tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
