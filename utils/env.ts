import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export function getEnvVar(name: string, defaultValue?: string): string {
	const value = process.env[name] ?? defaultValue;
	if (value === undefined) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
	return value;
}

export const env = {
	baseURL: getEnvVar('BASE_URL', 'http://localhost:3000'),
	username: getEnvVar('AUTH_USERNAME', ''),
	password: getEnvVar('AUTH_PASSWORD', ''),
	loginPath: getEnvVar('LOGIN_PATH', '/login'),
	dataPagePath: getEnvVar('DATA_PAGE_PATH', '/'),
	downloadDir: path.resolve(process.cwd(), getEnvVar('DOWNLOAD_DIR', 'downloads')),
	authProvider: (process.env.AUTH_PROVIDER || 'auto').toLowerCase() as
		| 'auto'
		| 'google'
		| 'microsoft'
		| 'password',
	detectTimeoutMs: Number(process.env.WAIT_TIMEOUT_MS ?? '15000'),
	navTimeoutMs: Number(process.env.NAV_TIMEOUT_MS ?? '30000'),
	secureMode: process.env.SECURE_MODE === 'true',
	headless: process.env.HEADLESS === 'true',
	minimized: process.env.MINIMIZED === 'true',
	skipScroll: process.env.SKIP_SCROLL === 'true',
	// Meeting filtering options
	meetingDateStart: process.env.MEETING_DATE_START ?? '', // Format: YYYY-MM-DD
	meetingDateEnd: process.env.MEETING_DATE_END ?? '', // Format: YYYY-MM-DD
	meetingTitleFilter: process.env.MEETING_TITLE_FILTER ?? '', // Partial match filter
};


