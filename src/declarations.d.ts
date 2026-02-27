declare module 'languages' {
	interface LanguageInfo {
		name?: string;
		nativeName?: string;
	}
	export function getLanguageInfo(code: string): LanguageInfo;
}
