import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  width = "100%",
  height = "1rem",
}) => {
  return (
    <div
      className={`skeleton-glow rounded ${className}`}
      style={{ width, height }}
    />
  );
};

// Profile-specific skeleton components
export const ProfileSkeleton: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton width="20px" height="20px" className="rounded" />
          <Skeleton width="60px" height="16px" />
        </div>
        <Skeleton width="80px" height="20px" />
        <div className="w-16" />
      </div>

      {/* Personal Information Card Skeleton */}
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton width="20px" height="20px" className="rounded" />
          <Skeleton width="180px" height="20px" />
        </div>

        <div className="space-y-4">
          {/* Name fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Skeleton width="80px" height="14px" className="mb-2" />
              <Skeleton width="100%" height="40px" className="rounded-md" />
            </div>
            <div>
              <Skeleton width="80px" height="14px" className="mb-2" />
              <Skeleton width="100%" height="40px" className="rounded-md" />
            </div>
          </div>

          {/* Phone field */}
          <div>
            <Skeleton width="100px" height="14px" className="mb-2" />
            <Skeleton width="100%" height="40px" className="rounded-md" />
          </div>

          {/* Description field */}
          <div>
            <Skeleton width="120px" height="14px" className="mb-2" />
            <Skeleton width="100%" height="96px" className="rounded-md" />
          </div>
        </div>
      </div>

      {/* Addresses Card Skeleton */}
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-6">
          <Skeleton width="20px" height="20px" className="rounded" />
          <Skeleton width="160px" height="20px" />
        </div>

        <div className="space-y-4">
          {/* Add Address Button Skeleton */}
          <Skeleton width="100%" height="40px" className="rounded-md" />
        </div>
      </div>

      {/* Save Button Skeleton */}
      <Skeleton width="100%" height="48px" className="rounded-md" />
    </div>
  );
};

// Home Page Skeletons
export const HeroSkeleton: React.FC = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl shadow-lg bg-gray-200">
      <div className="absolute inset-0 bg-gradient-to-t from-gray-300/70 via-gray-200/40 to-gray-100/20" />
      <div className="relative p-5 sm:p-6">
        <div className="max-w-xs space-y-3">
          <div className="h-6 w-48 skeleton-glow rounded-full" />
          <div className="h-10 w-64 skeleton-glow rounded" />
          <div className="h-4 w-56 skeleton-glow rounded" />
          <div className="flex gap-2 mt-4">
            <div className="h-8 w-20 skeleton-glow rounded" />
            <div className="h-8 w-24 skeleton-glow rounded" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const CategoriesSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-6 w-24 skeleton-glow rounded" />
        <div className="h-4 w-16 skeleton-glow rounded" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-square rounded-xl skeleton-glow" />
            <div className="h-3 w-full skeleton-glow rounded" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const FeaturedSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-6 w-20 skeleton-glow rounded" />
        <div className="h-4 w-16 skeleton-glow rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-white">
            <div className="aspect-square skeleton-glow" />
            <div className="space-y-2 p-3">
              <div className="h-4 w-3/4 skeleton-glow rounded" />
              <div className="flex items-center gap-2">
                <div className="h-5 w-12 skeleton-glow rounded" />
                <div className="h-4 w-10 skeleton-glow rounded" />
              </div>
              <div className="h-8 w-full skeleton-glow rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const MostOrderedSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-6 w-28 skeleton-glow rounded" />
        <div className="h-4 w-16 skeleton-glow rounded" />
      </div>
      <div className="-mx-4 overflow-x-auto">
        <div className="mx-4 flex gap-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="min-w-[200px] overflow-hidden rounded-xl border bg-white"
            >
              <div className="aspect-video skeleton-glow" />
              <div className="flex items-center justify-between p-3">
                <div className="space-y-1">
                  <div className="h-4 w-24 skeleton-glow rounded" />
                  <div className="h-3 w-16 skeleton-glow rounded" />
                </div>
                <div className="h-4 w-12 skeleton-glow rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const PriceCompareSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      <div className="h-6 w-24 skeleton-glow rounded" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-white">
            <div className="p-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-lg skeleton-glow" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="h-4 w-3/4 skeleton-glow rounded" />
                  <div className="h-3 w-1/2 skeleton-glow rounded" />
                </div>
                <div className="text-right space-y-1">
                  <div className="h-4 w-12 skeleton-glow rounded" />
                  <div className="h-3 w-10 skeleton-glow rounded" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const HomePageSkeleton: React.FC = () => {
  return (
    <section className="space-y-6">
      <HeroSkeleton />
      <CategoriesSkeleton />
      <FeaturedSkeleton />
      <MostOrderedSkeleton />
      <PriceCompareSkeleton />
    </section>
  );
};

export default Skeleton;
