import { useEffect, useRef, useState, type ReactNode } from 'react';

interface WizardTransitionProps {
  stepKey: string;
  children: ReactNode;
}

export function WizardTransition({ stepKey, children }: WizardTransitionProps) {
  const [displayedKey, setDisplayedKey] = useState(stepKey);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [animClass, setAnimClass] = useState('wizard-step-enter');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stepKey === displayedKey) {
      setDisplayedChildren(children);
      return;
    }

    // Exit animation
    setAnimClass('wizard-step-exit');
    const exitTimer = setTimeout(() => {
      setDisplayedKey(stepKey);
      setDisplayedChildren(children);
      setAnimClass('wizard-step-enter');
    }, 200); // exit duration

    return () => clearTimeout(exitTimer);
  }, [stepKey, children, displayedKey]);

  return (
    <div ref={containerRef} className={`wizard-step ${animClass}`} aria-live="polite">
      {displayedChildren}
    </div>
  );
}
