import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { GermanOnlyNotice, LegalLinks } from "@/components/LegalLinks";
import { legalInfo } from "@/lib/legal";

// Rechtstexte sind bewusst nur auf Deutsch (siehe SKIP in src/lib/i18n/extract.ts).
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const { missing } = legalInfo();
  return (
    <div className="min-h-dvh px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 inline-flex" aria-label="Zur Startseite">
          <Logo size={30} />
        </Link>
        <GermanOnlyNotice />
        {missing.length > 0 && (
          <div className="mb-6 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">
            <strong>Angaben fehlen.</strong> Trag in der <code>.env</code> auf dem Server ein: {missing.join(", ")}. Danach den
            Server neu starten. Ohne diese Angaben ist die Seite rechtlich unvollständig.
          </div>
        )}
        <article className="legal card p-6 sm:p-8">{children}</article>
        <LegalLinks className="mt-6" />
      </div>
    </div>
  );
}
