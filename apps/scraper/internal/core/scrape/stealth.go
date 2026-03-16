package scrape

// Stealth features for browser automation
// These techniques help avoid bot detection by masking automation signals
// Currently not in use - preserved for future implementation

// StealthScript returns JavaScript code to mask automation signals
// This includes:
// - Overriding navigator.webdriver
// - Adding chrome property for Chrome fingerprint
// - Overriding permissions query
// - Adding realistic plugins
// - Overriding language properties
func StealthScript() string {
	return `
		// Override navigator.webdriver
		Object.defineProperty(navigator, 'webdriver', {
			get: () => undefined
		});

		// Add chrome property for Chrome fingerprint
		window.chrome = {
			runtime: {}
		};

		// Override permissions
		const originalQuery = window.navigator.permissions.query;
		window.navigator.permissions.query = (parameters) => (
			parameters.name === 'notifications' ?
				Promise.resolve({ state: Notification.permission }) :
				originalQuery(parameters)
		);

		// Add realistic plugins
		Object.defineProperty(navigator, 'plugins', {
			get: () => [
				{
					0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
					description: "Portable Document Format",
					filename: "internal-pdf-viewer",
					length: 1,
					name: "Chrome PDF Plugin"
				}
			]
		});

		// Override language to be consistent
		Object.defineProperty(navigator, 'languages', {
			get: () => ['en-US', 'en']
		});
	`
}

// CanvasNoiseScript returns JavaScript code to add subtle noise to canvas fingerprinting
// This makes each fingerprint slightly unique to avoid detection
func CanvasNoiseScript() string {
	return `
		// Canvas fingerprint noise - makes each fingerprint slightly unique
		const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
		const originalToBlob = HTMLCanvasElement.prototype.toBlob;
		const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

		// Add subtle noise to canvas
		const noise = () => {
			return Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
		};

		HTMLCanvasElement.prototype.toDataURL = function() {
			const context = this.getContext('2d');
			if (context) {
				const imageData = context.getImageData(0, 0, this.width, this.height);
				for (let i = 0; i < imageData.data.length; i += 4) {
					imageData.data[i] += noise();     // R
					imageData.data[i + 1] += noise(); // G
					imageData.data[i + 2] += noise(); // B
				}
				context.putImageData(imageData, 0, 0);
			}
			return originalToDataURL.apply(this, arguments);
		};

		// Override WebGL fingerprinting
		const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
		WebGLRenderingContext.prototype.getParameter = function(parameter) {
			if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
				return 'Intel Inc.';
			}
			if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
				return 'Intel Iris OpenGL Engine';
			}
			return originalGetParameter.apply(this, arguments);
		};
	`
}

// MouseMovementScript returns JavaScript code to simulate human mouse movement
func MouseMovementScript() string {
	return `
		// Random mouse movement
		const moveX = Math.floor(Math.random() * 200) + 100;
		const moveY = Math.floor(Math.random() * 200) + 100;
		const event = new MouseEvent('mousemove', {
			clientX: moveX,
			clientY: moveY,
			bubbles: true
		});
		document.dispatchEvent(event);

		// Random scroll to simulate reading
		window.scrollTo({
			top: Math.floor(Math.random() * 500) + 200,
			behavior: 'smooth'
		});
	`
}

// StealthStrategy defines different levels of stealth techniques
type StealthStrategy string

const (
	// StealthBaseline uses basic stealth (webdriver mask + mouse + cookies)
	StealthBaseline StealthStrategy = "baseline"
	// StealthWarmup adds homepage navigation before target URL
	StealthWarmup StealthStrategy = "warmup"
	// StealthAssetLoading loads images/CSS to appear more realistic
	StealthAssetLoading StealthStrategy = "asset_loading"
	// StealthCanvasNoise adds canvas fingerprint noise
	StealthCanvasNoise StealthStrategy = "canvas_noise"
	// StealthMaxStealth combines all stealth techniques
	StealthMaxStealth StealthStrategy = "max_stealth"
)

// GetStealthScript returns the appropriate stealth script based on strategy
func GetStealthScript(strategy StealthStrategy) string {
	base := StealthScript()

	switch strategy {
	case StealthCanvasNoise, StealthMaxStealth:
		return base + "\n" + CanvasNoiseScript()
	default:
		return base
	}
}
