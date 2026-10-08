import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="glow w-full max-w-sm border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold tracking-wide text-accent">
          &gt; DEVICE_REGISTRY
        </h1>
        <p className="mt-1 text-sm text-muted">
          Sign in with your authorized Google account to continue.
        </p>
        <div className="mt-6">
          <GoogleSignInButton />
        </div>
      </div>
    </div>
  );
}
