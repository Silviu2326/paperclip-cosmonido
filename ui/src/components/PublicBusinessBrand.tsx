import type { CSSProperties, ReactNode } from "react";

export interface PublicBusinessBrandData {
  displayName: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  domainStatus: "unavailable";
}

/** Renders only the server's explicit public projection; callers must fetch it by company id. */
export function PublicBusinessBrand({ brand, children }: { brand: PublicBusinessBrandData; children?: ReactNode }) {
  const style = {
    "--public-business-primary": brand.primaryColor,
    "--public-business-accent": brand.accentColor,
  } as CSSProperties;
  return <section className="public-business-brand rounded-lg border bg-card p-4" style={style} aria-label={brand.displayName}>
    <div className="flex items-center gap-3">
      {brand.logoUrl && <img src={brand.logoUrl} alt="" className="size-10 rounded-md border object-contain" loading="lazy" referrerPolicy="no-referrer" />}
      <div className="min-w-0"><p className="public-business-brand-title truncate font-semibold">{brand.displayName}</p></div>
    </div>
    {children && <div className="mt-3">{children}</div>}
  </section>;
}
