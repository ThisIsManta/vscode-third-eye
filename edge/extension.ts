import * as vscode from 'vscode'

import Go from './Go'
import JavaScript from './JavaScript'
import Stylus from './Stylus'
import FileWatcher from './FileWatcher'

const packageJson = require('../package.json')

export function activate(context: vscode.ExtensionContext) {
	const languages = [
		new Go(),
		new JavaScript(),
		new Stylus(),
	]

	for (const language of languages) {
		const languageSelector = Array.isArray(language.id)
			? language.id.map(id => ({ language: id }))
			: [{ language: language.id }]

		if (process.env.NODE_ENV !== 'production') {
			for (const event of languageSelector.map(({ language }) => `onLanguage:${language}`)) {
				if (!packageJson.activationEvents.includes(event)) {
					throw new Error(`Expected the activation event "${event}" in package.json`)
				}
			}
		}

		context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(languageSelector, language))

		if ('provideImplementation' in language) {
			context.subscriptions.push(vscode.languages.registerImplementationProvider(languageSelector, language))
		}
	}
}

export function deactivate() {
	FileWatcher.dispose()
}
