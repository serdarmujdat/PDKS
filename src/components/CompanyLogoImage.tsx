import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface CompanyLogoImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  variant?: 'light' | 'dark';
}

export const CompanyLogoImage: React.FC<CompanyLogoImageProps> = ({
  src,
  alt = 'Kurumsal Logo',
  className = 'max-h-8 max-w-[150px] w-auto h-auto object-contain',
  variant = 'light',
}) => {
  const [hasError, setHasError] = useState(false);

  const trimmed = (src || '').trim();
  const isInvalidSrc = !trimmed || trimmed.startsWith('blob:');

  useEffect(() => {
    setHasError(false);
  }, [trimmed]);

  if (isInvalidSrc || hasError) {
    const isDark = variant === 'dark';
    return (
      <div
        role="img"
        aria-label={alt}
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg select-none shrink-0 ${
          isDark
            ? 'bg-indigo-950/90 border border-indigo-500/40 text-white'
            : 'bg-indigo-600 text-white shadow-2xs'
        }`}
      >
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
            isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-800/80 text-indigo-100'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
        </div>
        <div className="leading-none text-left pr-0.5">
          <span className="block text-[11px] font-extrabold tracking-wider text-white">
            ASEM
          </span>
          <span className="block text-[8px] font-semibold tracking-widest text-indigo-200">
            PDKS
          </span>
        </div>
      </div>
    );
  }

  return (
    <img
      src={trimmed}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
};
