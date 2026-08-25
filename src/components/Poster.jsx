import React from "react";

export function Poster({ src, alt, className = "", aspect = "aspect-[2/3]" }) {
  const [error, setError] = React.useState(false);
  return (
    <div className={`relative overflow-hidden bg-secondary ${aspect} ${className}`}>
      {src && !error ? (
        <img
          src={src}
          alt={alt || ""}
          loading="lazy"
          onError={() => setError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground/40">
          <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 16l5-5 4 4 3-3 6 6" />
            <circle cx="9" cy="9" r="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function Backdrop({ src, alt, className = "" }) {
  const [error, setError] = React.useState(false);
  if (!src || error) return null;
  return (
    <img
      src={src}
      alt={alt || ""}
      loading="lazy"
      onError={() => setError(true)}
      className={className}
    />
  );
}