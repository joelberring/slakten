

interface Props {
    onClose: () => void;
}

export function IntroModal({ onClose }: Props) {
    return (
        <div className="intro-modal-overlay">
            <div className="intro-modal-content">
                <span className="intro-eyebrow">VÄLKOMMEN TILL SLÄKTARKIVET</span>
                <h2>Utforska släkten</h2>
                <p>Fyra sätt att följa personer, platser och generationer.</p>

                <div className="intro-sections">
                    <div className="intro-section">
                        <h3>Trädvy</h3>
                        <p>Fäll ut grenar med <strong>+</strong> och se hur personerna hör ihop.</p>
                    </div>

                    <div className="intro-section">
                        <h3>Karta</h3>
                        <p>Se kända orter direkt på kartan och välj en person för att hitta den i trädet.</p>
                    </div>

                    <div className="intro-section">
                        <h3>Statistik</h3>
                        <p>Jämför levnadsår, namn och platser genom generationerna.</p>
                    </div>

                    <div className="intro-section">
                        <h3>Årsringar</h3>
                        <p>Zooma in bland generationerna och färglägg efter tid, plats eller livslängd.</p>
                    </div>
                </div>

                <button className="upload-btn" onClick={onClose}>
                    Börja utforska
                </button>
            </div>
        </div>
    );
}
