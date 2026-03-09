/**
 * BrandLogo - Single-word brand mark: "HAMMOC"
 * Used in page headers across the app
 */

export function BrandLogo() {
  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <span className="text-base font-bold leading-snug tracking-wider bg-gradient-to-r from-blue-600 to-violet-600 dark:from-blue-400 dark:to-violet-400 bg-clip-text text-transparent">
        HAMMOC
      </span>
      <span className="text-[0.55rem] font-medium leading-none tracking-widest uppercase text-gray-400 dark:text-gray-500 -mt-0.5">
        AGENTIC IDE
      </span>
    </div>
  );
}
