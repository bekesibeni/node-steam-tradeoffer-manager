declare module 'steam-totp' {
	export function getAuthCode(secret: string, timeOffset?: number): string;
	export function getTimeOffset(callback: (err: Error | null, offset: number, latency: number) => void): void;
	export function generateAuthCode(secret: string, timeOffset?: number): string;
}

declare module 'steam-user' {
	import { EventEmitter } from 'events';
	class SteamUser extends EventEmitter {
		logOn(options: Record<string, unknown>): void;
		[key: string]: unknown;
	}
	export = SteamUser;
}
