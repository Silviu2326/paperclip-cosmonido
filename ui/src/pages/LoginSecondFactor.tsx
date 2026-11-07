import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/api/auth";

export function LoginSecondFactor({ methods, onVerified, onBack }: {
  methods: string[];
  onVerified: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const allowed = methods.includes("totp");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (backup) await authApi.verifyBackupCode(code.trim());
      else if (methods.includes("totp")) await authApi.verifyTotp(code.trim());
      else throw new Error("No supported second-factor method is available.");
      await onVerified();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-lg border border-border p-6">
        <h1 className="text-xl font-semibold">Verify your identity</h1>
        <p className="mt-2 text-sm text-muted-foreground">Enter the code from your authenticator app to finish signing in.</p>
        {!allowed && <p role="alert" className="mt-4 text-sm text-destructive">This account has no supported second-factor flow enabled. Return to sign in and contact your administrator.</p>}
        <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-2 text-sm" htmlFor="second-factor-code">{backup ? "Recovery code" : "Authenticator code"}
            <Input id="second-factor-code" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} required disabled={!allowed || pending} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!allowed || !code.trim() || pending}>{pending ? "Verifying…" : "Verify and sign in"}</Button>
        </form>
        <div className="mt-4 flex justify-between gap-3 text-sm">
          <button className="text-muted-foreground underline" type="button" onClick={() => { setBackup((value) => !value); setCode(""); setError(null); }}>
            {backup ? "Use authenticator code" : "Use a recovery code"}
          </button>
          <button className="text-muted-foreground underline" type="button" onClick={onBack}>Back to sign in</button>
        </div>
      </section>
    </main>
  );
}
