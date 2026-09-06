import { DiscoverForm } from '@/components/discover-form';

export const dynamic = 'force-dynamic';

export default function DiscoverPage() {
  return (
    <>
      <h2>Nájsť firmy</h2>
      <p className="sub">
        Zadaj odvetvie a krajinu/mesto. Systém nájde firmy vo verejných zdrojoch, načíta ich web,
        overí kontakty proti ich vlastnej stránke a uloží ich ako leady. Každý údaj si nesie
        odkaz na zdroj — nič sa nedopĺňa odhadom.
      </p>
      <DiscoverForm />
    </>
  );
}
