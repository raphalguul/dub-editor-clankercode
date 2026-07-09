import React from 'react';

const About = () => {
    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
            <h3>About</h3>
            <p>
                This version of Dub Editor is maintained by Raph al Guul. 
                It is a fork from Michael C. Main's Dub Editor 2.4.3-beta 
                and all credit goes to him for building this tool in the 
                first place. You can support the original developer by 
                clicking the donate button above. The original source code
                can be found at{' '}
                <a href="https://github.com/deusprogrammer/dub-editor-electron">
                    https://github.com/deusprogrammer/dub-editor-electron
                </a>
                . If you paid for this program, you were scammed.
            </p>
            <h3>Donations</h3>
            <p>
                Donations to the original developer can be made via{' '}
                <a href="https://ko-fi.com/michaelcmain52278">Kofi</a>.
            </p>
            <h3>Disclaimer</h3>
            <p>
                This tool should only be used on clips that you legally own the
                rights to use and the creator of this software cannot be held
                liable for the actions of the end user.
            </p>
            <h3>Original Credits</h3>
            <h4>Developers</h4>
            <div>
                <strong>Lead Developer</strong>: Michael C. Main
                (deusprogrammer@gmail.com)
            </div>
            <h4>Testers</h4>
            <div>
                <strong>Tester</strong>: Typically Thomas
            </div>
            <div>
                <strong>Tester</strong>: Shnazzyone
            </div>
        </div>
    );
};

export default About;
