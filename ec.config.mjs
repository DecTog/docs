// @ts-check
import { defineEcConfig } from '@astrojs/starlight/expressive-code';

// Code blocks in the dectog.com identity. Syntax uses three colors only: the text color for code,
// strings and names; the link tone for keywords, tag names and property names; green-gray for
// comments and punctuation.
const palette = {
	light: { background: '#f7f8f7', text: '#1f2420', keyword: '#c2410c', quiet: '#5a6b5d' },
	dark: { background: '#1f2420', text: '#e8ecea', keyword: '#ff7732', quiet: '#a7b0a9' },
};

/** @param {'light' | 'dark'} type */
const theme = (type) => {
	const { background, text, keyword, quiet } = palette[type];
	return {
		name: `dectog-${type}`,
		type,
		colors: { 'editor.background': background, 'editor.foreground': text },
		settings: [
			{ settings: { background, foreground: text } },
			{ scope: ['comment', 'punctuation', 'meta.brace'], settings: { foreground: quiet } },
			{ scope: ['punctuation.definition.string'], settings: { foreground: text } },
			{
				scope: [
					'keyword',
					'storage',
					'constant.language',
					'entity.name.tag',
					'support.type.property-name',
				],
				settings: { foreground: keyword },
			},
			// Symbol operators (=, ?, !=) stay in the text color; word operators (new, as, in) are keywords.
			{ scope: ['keyword.operator'], settings: { foreground: text } },
			{
				scope: [
					'keyword.operator.new',
					'keyword.operator.expression',
					'keyword.operator.word',
					'keyword.operator.wordlike',
					'keyword.operator.logical.python',
				],
				settings: { foreground: keyword },
			},
		],
	};
};

export default defineEcConfig({
	themes: [theme('dark'), theme('light')],
	// The palette is chosen to meet AA (4.5:1); keep Expressive Code from shifting it further.
	minSyntaxHighlightingColorContrast: 4.5,
	// Shell blocks use the same frame as other code: no terminal title bar.
	defaultProps: {
		overridesByLang: { 'bash,sh,shell,zsh,console,powershell': { frame: 'code' } },
	},
	styleOverrides: {
		borderRadius: '0.75rem',
		borderColor: 'var(--dt-hairline)',
		codeBackground: 'var(--dt-surface)',
		codeFontSize: '0.875rem',
		codeLineHeight: '1.7',
		codePaddingBlock: '1rem',
		uiFontSize: '0.8125rem',
		focusBorder: 'var(--dt-accent-light)',
		frames: {
			frameBoxShadowCssValue: 'none',
			editorBackground: 'var(--dt-surface)',
			editorTabBarBackground: 'var(--dt-surface)',
			editorTabBarBorderColor: 'transparent',
			editorTabBarBorderBottomColor: 'var(--dt-hairline)',
			editorActiveTabBackground: 'transparent',
			editorActiveTabForeground: 'var(--dt-secondary)',
			editorActiveTabBorderColor: 'transparent',
			editorActiveTabIndicatorTopColor: 'transparent',
			editorActiveTabIndicatorBottomColor: 'transparent',
			terminalBackground: 'var(--dt-surface)',
			terminalTitlebarBackground: 'var(--dt-surface)',
			terminalTitlebarForeground: 'var(--dt-secondary)',
			terminalTitlebarBorderBottomColor: 'var(--dt-hairline)',
			terminalTitlebarDotsOpacity: '0',
			inlineButtonForeground: 'var(--dt-secondary)',
			inlineButtonBackground: 'var(--dt-secondary)',
			inlineButtonBorder: 'transparent',
			tooltipSuccessBackground: 'var(--dt-ink)',
			tooltipSuccessForeground: 'var(--dt-page)',
		},
	},
});
