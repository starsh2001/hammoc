/**
 * BrandLogo - Two-line stacked brand mark: "BMad" over "Studio"
 * Used in page headers across the app
 */

export function BrandLogo() {
  return (
    <div className="flex flex-col items-center leading-tight select-none">
      <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 bg-clip-text text-transparent">
        BMad
      </span>
      <span className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        Studio
      </span>
    </div>
  );
}
