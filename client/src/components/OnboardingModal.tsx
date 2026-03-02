import React, { useEffect, useMemo, useState } from 'react';
import './OnboardingModal.css';

type OnboardingRole = 'tutor' | 'teacher' | 'parent';

interface OnboardingStep {
  title: string;
  description: string;
}

interface OnboardingContent {
  heading: string;
  intro: string;
  steps: OnboardingStep[];
}

interface OnboardingModalProps {
  isOpen: boolean;
  role: OnboardingRole;
  onComplete: () => void;
  onSkip?: () => void;
}

const CONTENT_BY_ROLE: Record<OnboardingRole, OnboardingContent> = {
  tutor: {
    heading: 'Tutor Walkthrough',
    intro: 'Set up your workspace in a few guided steps.',
    steps: [
      {
        title: 'Start with learners',
        description: 'Add students first so assignments, scheduling, and progress tracking are available.',
      },
      {
        title: 'Build lesson flow',
        description: 'Create or select lessons, then assign them to learners to define their next activities.',
      },
      {
        title: 'Run daily operations',
        description: 'Use notifications, schedule, and notes to keep sessions coordinated and visible to families.',
      },
    ],
  },
  teacher: {
    heading: 'Teacher Walkthrough',
    intro: 'Use your dashboard to prioritize support quickly.',
    steps: [
      {
        title: 'Check interventions first',
        description: 'Start with flagged learners needing attention based on risk, completion, and inactivity.',
      },
      {
        title: 'Review activity trends',
        description: 'Filter by grade, category, and date to spot engagement and performance patterns.',
      },
      {
        title: 'Align with schedule',
        description: 'Cross-check upcoming sessions and tutor notes to plan targeted classroom follow-up.',
      },
    ],
  },
  parent: {
    heading: 'Parent Walkthrough',
    intro: 'See what to do first and where to look each day.',
    steps: [
      {
        title: 'Confirm upcoming sessions',
        description: 'Open Sessions and confirm appointments so tutor plans stay on track.',
      },
      {
        title: 'Follow learning progress',
        description: 'Review completed games, scores, and tutor notes for practical at-home support.',
      },
      {
        title: 'Manage consent and privacy',
        description: 'Use the Consent & Privacy section to update permissions and request a data export.',
      },
    ],
  },
};

const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  role,
  onComplete,
  onSkip,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  const content = useMemo(() => CONTENT_BY_ROLE[role], [role]);
  const totalSteps = content.steps.length;
  const activeStep = content.steps[stepIndex];
  const isLastStep = stepIndex >= totalSteps - 1;

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
      return;
    }
    onComplete();
  };

  const handlePrimaryAction = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  useEffect(() => {
    if (!isOpen) return;
    setStepIndex(0);
  }, [isOpen, role]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleSkip();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onSkip, onComplete]);

  if (!isOpen) return null;

  return (
    <div className="modal onboarding-modal" role="dialog" aria-modal="true" aria-label={`${content.heading} onboarding`}>
      <div className="modal-content onboarding-modal-content">
        <div className="modal-header onboarding-modal-header">
          <div>
            <h2>{content.heading}</h2>
            <p>{content.intro}</p>
          </div>
          <button type="button" className="close" aria-label="Close onboarding" onClick={handleSkip}>
            ×
          </button>
        </div>

        <div className="onboarding-modal-progress" aria-hidden="true">
          {content.steps.map((step, idx) => (
            <span
              key={step.title}
              className={`onboarding-step-dot${idx === stepIndex ? ' active' : ''}${idx < stepIndex ? ' done' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-modal-body">
          <p className="onboarding-step-label">
            Step {stepIndex + 1} of {totalSteps}
          </p>
          <h3>{activeStep.title}</h3>
          <p>{activeStep.description}</p>
        </div>

        <div className="modal-actions onboarding-modal-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleSkip}>
            Skip
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handlePrimaryAction}>
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
