import React from 'react';

interface SkeletonLoaderProps {
  rows?: number;
}

const SkeletonLoader = ({ rows = 4 }: SkeletonLoaderProps) => (
  <div className="space-y-4 animate-fade-in">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => (
        <div key={i} className="skeleton-loading h-28 rounded-lg" />
      ))}
    </div>
    <div className="skeleton-loading h-10 w-48 rounded-lg" />
    {Array.from({length: rows}).map((_,i) => (
      <div key={i} className="skeleton-loading h-12 rounded-lg" />
    ))}
  </div>
);

export default SkeletonLoader;
