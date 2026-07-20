import { useState } from "react";
import ScanStep from "./ScanStep";
import ReviewStep from "./ReviewStep";
import BuildStep from "./BuildStep";
import "../../styles/onboarding.css";

export default function Onboarding({ scanData, themeData, aiSummary, onboardingCompleted, savedSpec }) {
  const [step, setStep] = useState(onboardingCompleted ? 2 : 0);
  const [generatedSpec, setGeneratedSpec] = useState(onboardingCompleted ? savedSpec : null);

  const next = () => setStep((s) => Math.min(s + 1, 2));

  const handleReviewComplete = (spec) => {
    setGeneratedSpec(spec);
    next();
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return <ScanStep onComplete={next} scanData={scanData} />;
      case 1:
        return (
          <ReviewStep
            onComplete={handleReviewComplete}
            scanData={scanData}
            themeData={themeData}
            aiSummary={aiSummary}
          />
        );
      case 2:
        return <BuildStep spec={generatedSpec} />;
      default:
        return null;
    }
  };

  return (
    <div className="ob-wrap">
      {renderStep()}
    </div>
  );
}
  