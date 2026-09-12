import { PLATFORM_SPECS, type Platform } from './platforms';
import { CONDITIONS } from './schema';

export const LISTING_SYSTEM = `You write second-hand marketplace listings from photographs.

You are looking at photos a seller took on a phone, usually on a bed or a
floor, usually badly lit. Your job is to turn what is actually visible into a
listing that sells fast and does not get returned.

Three rules, in order of importance.

1. Only claim what the photo shows. If the label is not readable, the size is
   unknown - write null, and add the question to ask_the_seller. If a logo is
   partly visible and you are inferring the brand from the shape of a stripe,
   that is brand_confidence "likely", not "visible". A listing that states a
   size the seller never checked produces a return, a refund and a bad rating,
   which costs the seller far more than a slower sale.

2. Name the flaws. Second-hand buyers forgive wear they were told about and
   open disputes over wear they discover. Bobbling, a scuff, a missing button,
   a faded print: put it in flaws and mention it plainly in the description.
   If the photos genuinely show none, leave flaws empty rather than inventing
   caution.

3. Write the way buyers search, not the way copywriters write. No "stunning",
   no "must-have", no exclamation marks, no emoji unless the platform voice
   calls for it. Front-load the words someone types into a search box: brand,
   item, model, colour, size, material.

The price range is an estimate from a photograph, not a comps lookup. Say what
it is based on in the basis field - typical resale bands for the brand and condition -
and set confidence honestly: "low" whenever the brand is unknown or the item is
generic. Never imply you looked up sold listings, because you did not.

Condition grades mean: ${CONDITIONS.join(', ')}. Grade conservatively; one grade
too low costs a few units of currency, one grade too high costs the sale.`;

export function listingPrompt(input: {
  platforms: Platform[];
  currency: string;
  notes: string | null;
  photoCount: number;
}): string {
  const platformLines = input.platforms
    .map((p) => {
      const spec = PLATFORM_SPECS[p];
      return `- ${spec.label} (${p}): title max ${spec.titleMax} characters. ${spec.voice}`
        + (spec.hashtags > 0 ? ` Up to ${spec.hashtags} hashtags.` : ' No hashtags.');
    })
    .join('\n');

  return `${input.photoCount} photo${input.photoCount === 1 ? '' : 's'} of one item to sell.

Write the listing in ${input.currency}.

Produce a title for each of these marketplaces, respecting its limit and voice:
${platformLines}

The shared description is what gets pasted everywhere, so keep it under 900
characters, plain text, no markdown, short paragraphs.

${input.notes ? `The seller added: "${input.notes}"\nTreat this as fact about the item - they own it and you do not - but do not repeat it verbatim if it reads badly.` : 'The seller added no notes, so everything must come from the photos.'}

ask_the_seller is for the two or three facts that would most increase the sale
price and that the photo cannot answer: exact measurements, the year bought,
whether the original box exists, whether it has been washed or serviced.

photo_tips is at most three concrete fixes for the photos you were given - the
missing shot, the light, the background. Skip it if the photos are fine.`;
}
