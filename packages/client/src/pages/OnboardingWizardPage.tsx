import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useProjectStore } from '../stores/projectStore';
import { api } from '../services/api/client';
import type { CLIStatusResponse } from '@hammoc/shared';
import { WizardTransition } from '../components/onboarding/WizardTransition';
import { OnboardingErrorBoundary } from '../components/common/OnboardingErrorBoundary';
import { DisplayNameStep } from '../components/onboarding/steps/DisplayNameStep';
import { PasswordStep } from '../components/onboarding/steps/PasswordStep';
import { AuthMethodStep } from '../components/onboarding/steps/AuthMethodStep';
import { ClaudeLoginStep } from '../components/onboarding/steps/ClaudeLoginStep';
import { ApiKeyStep } from '../components/onboarding/steps/ApiKeyStep';
import { FirstProjectStep } from '../components/onboarding/steps/FirstProjectStep';
import { CompletionStep } from '../components/onboarding/steps/CompletionStep';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ChevronLeft } from 'lucide-react';

export type WizardStep =
  | 'display-name'
  | 'password'
  | 'auth-method'
  | 'api-key'
  | 'claude-login'
  | 'first-project'
  | 'done';

const MAIN_STEPS: WizardStep[] = [
  'display-name',
  'password',
  'auth-method',
  'first-project',
  'done',
];

function getStepIndex(step: WizardStep): number {
  if (step === 'claude-login' || step === 'api-key') return MAIN_STEPS.indexOf('auth-method');
  return MAIN_STEPS.indexOf(step);
}

interface SkipState {
  passwordConfigured: boolean;
  isAuthenticated: boolean;
  hasAuth: boolean; // has Claude account or API key
  hasProjects: boolean;
}

function deriveStartStep(state: SkipState): WizardStep {
  if (!state.passwordConfigured) return 'display-name';
  if (!state.isAuthenticated) return 'password';
  if (!state.hasAuth) return 'auth-method';
  if (!state.hasProjects) return 'first-project';
  return 'done';
}

function OnboardingWizardContent() {
  const navigate = useNavigate();
  const { t } = useTranslation('auth');
  const { isAuthenticated, isPasswordConfigured, checkAuth } = useAuthStore();
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);
  const prefsLoaded = usePreferencesStore((s) => s.loaded);

  const [currentStep, setCurrentStep] = useState<WizardStep | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive starting step on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      await checkAuth();
      const authState = useAuthStore.getState();

      let hasAuth = false;
      let hasProjects = false;

      if (authState.isAuthenticated) {
        try {
          const cliStatus = await api.get<CLIStatusResponse>('/cli-status');
          hasAuth = cliStatus.authenticated || cliStatus.apiKeySet;
        } catch { /* treat as no auth */ }

        try {
          const projects = await api.get<unknown[]>('/projects');
          hasProjects = projects.length > 0;
        } catch { /* treat as no projects */ }
      }

      if (cancelled) return;

      const startStep = deriveStartStep({
        passwordConfigured: authState.isPasswordConfigured === true,
        isAuthenticated: authState.isAuthenticated,
        hasAuth,
        hasProjects,
      });

      if (startStep === 'done') {
        // All conditions met — mark complete and redirect
        updatePreferences({ onboardingComplete: true });
        navigate('/', { replace: true });
        return;
      }

      setCurrentStep(startStep);
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Session expiration detection: if auth drops after password step, go back to password
  useEffect(() => {
    if (!currentStep || loading) return;
    const postPasswordSteps: WizardStep[] = ['auth-method', 'claude-login', 'api-key', 'first-project'];
    if (postPasswordSteps.includes(currentStep) && !isAuthenticated) {
      setCurrentStep('password');
    }
  }, [isAuthenticated, currentStep, loading]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && currentStep) {
        handleBack();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  const handleNext = useCallback((nextStep?: WizardStep) => {
    if (!currentStep) return;

    if (nextStep) {
      setCurrentStep(nextStep);
      return;
    }

    const order: WizardStep[] = [
      'display-name', 'password', 'auth-method',
      'claude-login', 'api-key', 'first-project', 'done',
    ];
    const idx = order.indexOf(currentStep);
    if (idx < order.length - 1) {
      setCurrentStep(order[idx + 1]);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (!currentStep) return;

    const backMap: Record<WizardStep, WizardStep | null> = {
      'display-name': null,
      'password': 'display-name',
      'auth-method': 'password',
      'claude-login': 'auth-method',
      'api-key': 'auth-method',
      'first-project': 'auth-method',
      'done': 'first-project',
    };
    const prev = backMap[currentStep];
    if (prev) setCurrentStep(prev);
  }, [currentStep]);

  if (loading || !currentStep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const stepIndex = getStepIndex(currentStep);
  const showBack = currentStep !== 'display-name';

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-page)] px-4"
    >
      <div className="w-full max-w-[480px] relative">
        {/* Back button */}
        {showBack && currentStep !== 'done' && (
          <button
            type="button"
            onClick={handleBack}
            className="absolute -top-12 left-0 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400
                       hover:text-gray-700 dark:hover:text-gray-200 transition-colors min-h-[44px] min-w-[44px]"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('wizard.back')}
          </button>
        )}

        {/* Progress dots */}
        {currentStep !== 'done' && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {MAIN_STEPS.filter((s) => s !== 'done').map((s, i) => (
              <div
                key={s}
                className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                  i === stepIndex
                    ? 'bg-[var(--accent,#3b82f6)]'
                    : 'border border-[var(--border,#d1d5db)] bg-transparent'
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        {/* Step content */}
        <WizardTransition stepKey={currentStep}>
          {currentStep === 'display-name' && (
            <DisplayNameStep
              onNext={() => handleNext('password')}
              onSkip={() => handleNext('password')}
            />
          )}
          {currentStep === 'password' && (
            <PasswordStep onNext={() => handleNext('auth-method')} />
          )}
          {currentStep === 'auth-method' && (
            <AuthMethodStep
              onSelectClaude={() => goToStep('claude-login')}
              onSelectApiKey={() => goToStep('api-key')}
            />
          )}
          {currentStep === 'claude-login' && (
            <ClaudeLoginStep onNext={() => handleNext('first-project')} />
          )}
          {currentStep === 'api-key' && (
            <ApiKeyStep
              onNext={() => handleNext('first-project')}
              onSkip={() => handleNext('first-project')}
            />
          )}
          {currentStep === 'first-project' && (
            <FirstProjectStep
              onNext={() => goToStep('done')}
              onSkip={() => goToStep('done')}
            />
          )}
          {currentStep === 'done' && <CompletionStep />}
        </WizardTransition>
      </div>
    </div>
  );
}

export function OnboardingWizardPage() {
  return (
    <OnboardingErrorBoundary>
      <OnboardingWizardContent />
    </OnboardingErrorBoundary>
  );
}
