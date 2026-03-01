

interface Props {
    onClose: () => void;
}

export function IntroModal({ onClose }: Props) {
    return (
        <div className="intro-modal-overlay">
            <div className="intro-modal-content">
                <h2>Välkommen till släktträdet! 📖🌳</h2>
                <p>Den här appen hjälper dig att utforska din släkthistoria på ett interaktivt sätt.</p>

                <div className="intro-sections">
                    <div className="intro-section">
                        <h3>🌳 Trädvyn</h3>
                        <p>Trädet börjar förenklat. Klicka på lila cirklar med <strong>+</strong> för att fälla ut grenar och se fler släktingar.</p>
                    </div>

                    <div className="intro-section">
                        <h3>📍 Kartan</h3>
                        <p>Se var släkten har bott genom tiderna. Du kan klicka på en person på kartan för att hitta dem direkt i trädet.</p>
                        <p style={{ fontSize: '0.75rem', marginTop: '5px', fontStyle: 'italic', opacity: 0.8 }}>
                            Obs: Första gången du öppnar kartan kan det ta upp till 30 minuter att läsa in alla orter då de behöver geokodas en och en.
                        </p>
                    </div>

                    <div className="intro-section">
                        <h3>🔍 Analysverktyg</h3>
                        <p>Använd panelen uppe till höger i trädvyn för att hitta närmaste vägen mellan två personer eller leta efter kusingiften.</p>
                    </div>
                </div>

                <button className="upload-btn" onClick={onClose} style={{ marginTop: '20px' }}>
                    Börja utforska
                </button>
                <div style={{ height: '30px' }}></div>
            </div>
        </div>
    );
}
