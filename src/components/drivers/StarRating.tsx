import React from 'react';

interface StarRatingProps {
  value: number;           // 0–5, can be fractional
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  onChange?: (val: number) => void;
  className?: string;
}

const SIZE = { sm: 14, md: 18, lg: 24 };

export const StarRating: React.FC<StarRatingProps> = ({
  value, max = 5, size = 'md', interactive = false, onChange, className = '',
}) => {
  const px = SIZE[size];

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: max }, (_, i) => {
        const filled = value >= i + 1;
        const half = !filled && value >= i + 0.5;
        return (
          <svg
            key={i}
            width={px}
            height={px}
            viewBox="0 0 24 24"
            fill="none"
            className={interactive ? 'cursor-pointer transition-transform hover:scale-110' : ''}
            onClick={interactive && onChange ? () => onChange(i + 1) : undefined}
          >
            <defs>
              {half && (
                <linearGradient id={`half-${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="50%" stopColor="transparent" />
                </linearGradient>
              )}
            </defs>
            <polygon
              points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
              fill={
                filled
                  ? '#f59e0b'
                  : half
                  ? `url(#half-${i})`
                  : 'transparent'
              }
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      })}
    </span>
  );
};

/** Exibe "4.2 ★ (12)" ou "Sem avaliação" */
export const RatingLabel: React.FC<{ rating: number | null | undefined; count?: number; size?: 'sm' | 'md' }> = ({
  rating, count, size = 'sm',
}) => {
  if (!rating) return <span className="text-xs text-muted-foreground italic">Sem avaliação</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      <StarRating value={rating} size="sm" />
      <span className="font-medium text-amber-600">{rating.toFixed(1)}</span>
      {count != null && count > 0 && (
        <span className="text-muted-foreground">({count})</span>
      )}
    </span>
  );
};
