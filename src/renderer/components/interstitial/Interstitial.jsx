import React from 'react';

export const handleInterstitial = (promise, openInterstitial) => {
    openInterstitial(true);
    // finally, not then, so a rejected task can never orphan the full screen
    // overlay. Rejections still propagate to the caller as before.
    return Promise.resolve(promise).finally(() => openInterstitial(false));
};

export default ({ isOpen, children }) => {
    if (isOpen) {
        return (
            <div className="interstitial">
                <div>
                    <div className="lds-dual-ring"></div>
                    <br />
                    <br />
                    <div className="interstitial-message">{children}</div>
                </div>
            </div>
        );
    }

    return <div></div>;
};
