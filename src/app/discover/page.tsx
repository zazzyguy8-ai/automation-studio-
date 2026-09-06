import { DiscoverForm } from '@/components/discover-form';

export const dynamic = 'force-dynamic';

export default function DiscoverPage() {
  return (
    <>
      <h2>Find companies</h2>
      <p className="sub">
        Enter an industry and a country/city. The system finds companies in public sources, reads
        their website, verifies contacts against their own pages, and saves them as leads. Every
        value carries a link to its source — nothing is filled in by guesswork.
      </p>
      <DiscoverForm />
    </>
  );
}
