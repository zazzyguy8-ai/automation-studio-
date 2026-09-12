import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accountForRequest, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { quotaFor } from '@/lib/quota';
import { generateListing, ACCEPTED_IMAGE_TYPES, MAX_IMAGES } from '@/lib/listing/generate';
import { PLATFORMS, type Platform } from '@/lib/listing/platforms';

export const runtime = 'nodejs';
/** Vision plus a full listing runs 10-25s; the platform default would cut it. */
export const maxDuration = 60;

const BodySchema = z.object({
  photos: z.array(z.object({
    media_type: z.enum(ACCEPTED_IMAGE_TYPES),
    data: z.string().min(100),
  })).min(1).max(MAX_IMAGES),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  currency: z.string().length(3).default('USD'),
  notes: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  const { account, setCookie } = await accountForRequest();

  const quota = await quotaFor(account);
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message, quota, upgrade: account.plan === 'free' }, { status: 402 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'That request was not a photo set this can read.' }, { status: 400 });
  }

  let listing;
  try {
    listing = await generateListing({
      photos: body.photos,
      platforms: body.platforms as Platform[],
      currency: body.currency.toUpperCase(),
      notes: body.notes ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The listing could not be generated.';
    // The model and config messages are written for a human to act on, so
    // they are passed through rather than replaced with "something went wrong".
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const store = await getStore();
  const saved = await store.saveListing(account.id, body.platforms[0] as Platform, listing);
  const after = await quotaFor(account);

  const response = NextResponse.json({ id: saved.id, listing, quota: after });
  if (setCookie) response.cookies.set(SESSION_COOKIE, setCookie, sessionCookieOptions);
  return response;
}
