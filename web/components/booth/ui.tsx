import type { ButtonHTMLAttributes, ReactNode } from "react";

type Tone = "ember" | "ghost" | "verdigris";

const tones: Record<Tone, string> = {
  ember:
    "bg-ember text-ink border border-ember hover:bg-[#ecb752] disabled:bg-ember/40 disabled:border-ember/20 disabled:text-ink/60",
  verdigris: "bg-transparent text-verdigris border border-verdigris/70 hover:bg-verdigris/10 disabled:opacity-50",
  ghost: "bg-transparent text-faded border border-transparent hover:text-parchment underline underline-offset-4 decoration-faded/40",
};

export function Button({ tone = "ember", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      {...props}
      className={`press inline-flex items-center justify-center gap-2 rounded-[3px] px-6 py-3 text-(length:--text-body) font-semibold tracking-wide disabled:cursor-not-allowed ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Whisper({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-(length:--text-whisper) text-faded ${className}`}>{children}</p>;
}

export function Scroll({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`parchment tarot-frame rounded-[2px] ${className}`}>{children}</div>;
}

export function ErrorNote({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 border-l-0 border border-hex/60 bg-hex/10 px-4 py-3 text-(length:--text-whisper) text-parchment">
      <span aria-hidden className="text-hex">✦</span>
      <span className="flex-1">{message}</span>
      {onDismiss ? (
        <button onClick={onDismiss} className="text-faded hover:text-parchment" aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={`https://testnet.arcscan.app/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="text-verdigris underline decoration-verdigris/40 underline-offset-4 hover:decoration-verdigris"
    >
      {label} ↗
    </a>
  );
}
