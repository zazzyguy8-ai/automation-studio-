import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { OnboardingAnswersSchema, campaignFromAnswers, projectMonthly } from '@/lib/engine/onboarding';

/**
 * Turns the questionnaire into a campaign.
 *
 * Creates it paused-free but sends nothing: a campaign existing and a campaign
 * having permission to email are two different things, and the second one is
 * still the approval inbox's decision, not this endpoint's.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = OnboardingAnswersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Some answers are missing or unusable.',
      issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    }, { status: 400 });
  }

  const derived = campaignFromAnswers(parsed.data);
  const store = await getStore();
  const campaign = await store.insertCampaign(derived.campaign);

  return NextResponse.json({
    campaign,
    adjustments: derived.adjustments,
    extra_cities: derived.extra_cities,
    projection: projectMonthly(derived),
  });
}
