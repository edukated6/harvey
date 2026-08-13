window.HARVEY_ANALYTICS_ENDPOINT = window.HARVEY_ANALYTICS_ENDPOINT || 'https://harvey-analytics-api.harvey-analytics-worker.workers.dev/events';
window.HARVEY_ANALYTICS_API_BASE = window.HARVEY_ANALYTICS_API_BASE || 'https://harvey-analytics-api.harvey-analytics-worker.workers.dev';
window.HARVEY_CHECKOUT_API_BASE = window.HARVEY_CHECKOUT_API_BASE || 'https://harvey-analytics-api.harvey-analytics-worker.workers.dev';
// Replace empty values with your live Stripe Payment Links if you want direct static links as a fallback.
window.HARVEY_CHECKOUT_LINKS = window.HARVEY_CHECKOUT_LINKS || {
	default: '',
	// Single-service links.
	services: {
		'motion-graphics': '',
		'short-form-editing': 'https://buy.stripe.com/28EeVd2u9gho3D39Ifg7e00',
		'long-form-editing': '',
		'show-producing': '',
	},
	// Optional bundle links keyed by sorted service IDs.
	bundles: {
		'long-form-editing+motion-graphics': '',
		'motion-graphics+short-form-editing': '',
		'long-form-editing+short-form-editing': '',
		'long-form-editing+motion-graphics+short-form-editing': '',
		'motion-graphics+show-producing': '',
		'long-form-editing+show-producing': '',
		'short-form-editing+show-producing': '',
		'long-form-editing+motion-graphics+show-producing': '',
		'motion-graphics+short-form-editing+show-producing': '',
		'long-form-editing+short-form-editing+show-producing': '',
		'long-form-editing+motion-graphics+short-form-editing+show-producing': '',
	},
};
