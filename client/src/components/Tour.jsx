import { useState, useEffect } from 'react';
import Joyride, { STATUS } from 'react-joyride';
import { useNavigate, useLocation } from 'react-router-dom';
import { tourSteps } from '../config/tourSteps';

function Tour({ run, setRun, darkMode }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [stepIndex, setStepIndex] = useState(0);

    // Check if tour was completed before
    useEffect(() => {
        const tourCompleted = localStorage.getItem('tourCompleted');
        if (!tourCompleted && run === undefined) {
            setRun(true);
        }
    }, []);

    const handleCallback = (data) => {
        const { status, index, type, action } = data;

        // Handle step navigation
        if (type === 'step:after') {
            const nextStep = tourSteps[index + 1];

            // If next step has a different page, navigate there
            if (nextStep?.page && nextStep.page !== location.pathname) {
                navigate(nextStep.page);
                // Small delay to let page render before showing tooltip
                setTimeout(() => {
                    setStepIndex(index + 1);
                }, 300);
                return;
            }

            setStepIndex(index + 1);
        }

        // Handle tour completion or skip
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRun(false);
            setStepIndex(0);
            localStorage.setItem('tourCompleted', 'true');
            navigate('/');
        }
    };

    // Custom styles for the tour
    const styles = {
        options: {
            primaryColor: '#16a34a', // primary-600 green
            backgroundColor: darkMode ? '#1f2937' : '#ffffff',
            textColor: darkMode ? '#f3f4f6' : '#111827',
            arrowColor: darkMode ? '#1f2937' : '#ffffff',
            overlayColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
        },
        buttonNext: {
            backgroundColor: '#16a34a',
            color: '#ffffff',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
        },
        buttonBack: {
            color: darkMode ? '#9ca3af' : '#4b5563',
            marginRight: '0.5rem',
        },
        buttonSkip: {
            color: darkMode ? '#9ca3af' : '#6b7280',
        },
        buttonClose: {
            color: darkMode ? '#9ca3af' : '#6b7280',
        },
        tooltip: {
            borderRadius: '0.75rem',
            padding: '1rem',
        },
        tooltipContent: {
            padding: '0.5rem 0',
        },
        beacon: {
            display: 'none', // Hide beacons, we use disableBeacon on first step
        },
    };

    return (
        <Joyride
            steps={tourSteps}
            run={run}
            stepIndex={stepIndex}
            continuous
            showProgress
            showSkipButton
            callback={handleCallback}
            styles={styles}
            locale={{
                back: 'Back',
                close: 'Close',
                last: 'Finish',
                next: 'Next',
                skip: 'Skip Tour',
            }}
            floaterProps={{
                disableAnimation: true,
            }}
        />
    );
}

export default Tour;
