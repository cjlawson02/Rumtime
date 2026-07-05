type WizardErrorBannerProps = {
  error: string | null;
};

export function WizardErrorBanner({ error }: WizardErrorBannerProps) {
  if (!error) return null;
  return <p className="mb-4 text-sm text-destructive">{error}</p>;
}
