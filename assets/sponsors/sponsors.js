// Sponsor Rotation Script
(function() {
    // Liste der Sponsor-Logos (füge hier deine Dateien hinzu)
    const sponsorLogos = [
        'assets/sponsors/sponsor1.png',
        'assets/sponsors/sponsor2.png'
    ];

    let currentSponsorIndex = 0;
    let sponsorsInitialized = false;

    function initSponsors() {
        // Finde die alte players_alive Box
        const oldBox = document.querySelector('.players_alive');
        if (!oldBox || sponsorsInitialized) return;

        console.log('Initializing sponsors...');
        sponsorsInitialized = true;

        // Erstelle neuen Sponsor Container
        const sponsorContainer = document.createElement('div');
        sponsorContainer.className = 'sponsor_container';

        // Statisches TACAM Logo (Graustufen)
        const staticLogo = document.createElement('div');
        staticLogo.className = 'sponsor_logo_static';
        const tacamImg = document.createElement('img');
        tacamImg.src = 'assets/sponsors/tacam_logo.png';
        tacamImg.alt = 'TACAM';
        tacamImg.onerror = () => console.error('❌ Failed to load TACAM logo from:', tacamImg.src);
        tacamImg.onload = () => console.log('✅ TACAM logo loaded!');
        staticLogo.appendChild(tacamImg);

        // Rotierender Sponsor Container
        const rotatingLogo = document.createElement('div');
        rotatingLogo.className = 'sponsor_logo_rotating';
        
        // Erstelle alle Sponsor-Bilder
        sponsorLogos.forEach((logoSrc, index) => {
            const img = document.createElement('img');
            img.src = logoSrc;
            img.alt = `Sponsor ${index + 1}`;
            img.onerror = () => console.error(`Failed to load sponsor logo: ${logoSrc}`);
            img.onload = () => console.log(`Loaded sponsor logo: ${logoSrc}`);
            if (index === 0) img.classList.add('active');
            rotatingLogo.appendChild(img);
        });

        // Reihenfolge: Rotating zuerst (links), dann TACAM (rechts)
        sponsorContainer.appendChild(rotatingLogo);
        sponsorContainer.appendChild(staticLogo);

        // Ersetze die alte Box
        oldBox.parentNode.replaceChild(sponsorContainer, oldBox);
        console.log('Sponsors initialized successfully!');

        // Starte die Rotation
        if (sponsorLogos.length > 1) {
            setInterval(rotateSponsor, 10000); // Alle 10 Sekunden
        }
    }

    function rotateSponsor() {
        const rotatingContainer = document.querySelector('.sponsor_logo_rotating');
        if (!rotatingContainer) return;

        const images = rotatingContainer.querySelectorAll('img');
        if (images.length === 0) return;
        
        console.log(`Rotating sponsor: ${currentSponsorIndex} -> ${(currentSponsorIndex + 1) % sponsorLogos.length}`);
        
        // Entferne 'active' vom aktuellen Bild
        images[currentSponsorIndex].classList.remove('active');
        
        // Nächster Index
        currentSponsorIndex = (currentSponsorIndex + 1) % images.length;
        
        // Füge 'active' zum nächsten Bild hinzu
        images[currentSponsorIndex].classList.add('active');
    }

    // Warte auf das players_alive Element mit MutationObserver
    function waitForPlayersAlive() {
        // Versuche sofort
        initSponsors();
        
        // Wenn nicht gefunden, beobachte DOM-Änderungen
        const observer = new MutationObserver((mutations) => {
            if (document.querySelector('.players_alive')) {
                initSponsors();
                if (sponsorsInitialized) {
                    observer.disconnect();
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Timeout nach 10 Sekunden
        setTimeout(() => {
            observer.disconnect();
            if (!sponsorsInitialized) {
                console.error('Players alive element not found after 10 seconds');
            }
        }, 10000);
    }

    // Initialisiere wenn DOM bereit ist
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForPlayersAlive);
    } else {
        waitForPlayersAlive();
    }
})();
